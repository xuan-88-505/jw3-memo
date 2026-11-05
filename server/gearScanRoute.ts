import express, { type Express, type Request, type Response } from "express";
import { invokeLLM, type InvokeParams } from "./_core/llm";
import { RateLimiter } from "./feedback";
import { clientIp, cors } from "./feedbackRoute";
import {
  SCAN_PROMPT,
  SCAN_SCHEMA,
  checkImage,
  extractJson,
  sanitizeScan,
  type ScanResult,
} from "./gearScan";
import {
  TALENT_JSON_HINT,
  TALENT_PROMPT,
  TALENT_SCHEMA,
  sanitizeTalentScan,
  type TalentScanResult,
} from "./talentScan";

/**
 * 截图读字的两个接口，写法一样：
 *   POST /api/gear-scan    { image: "data:image/jpeg;base64,…" } → 200 { ok: true, result: ScanResult }
 *   POST /api/talent-scan  { image } → 200 { ok: true, result: TalentScanResult }
 *   → 400 invalid / 413 too_large / 429 rate_limited / 502 failed / 504 timeout
 *
 * 截图只在这次请求里交给模型读字，不存库、不落盘、不写日志。
 * 实测 gemini-3-flash-preview 读推栏长截图约 6 秒、12 件全对；gemini-3.8-flash 要 18 秒还数错了精炼星数。
 */
const MODEL = "gemini-3-flash-preview";
const TIMEOUT_MS = 45_000;

/** 每个接口各自：同一 IP 10 分钟 20 张、24 小时 120 张；只是尽力而为，不当作安全边界 */
const newLimiter = () =>
  new RateLimiter([
    { ms: 10 * 60 * 1000, max: 20 },
    { ms: 24 * 60 * 60 * 1000, max: 120 },
  ]);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function contentText(r: Awaited<ReturnType<typeof invokeLLM>>) {
  const c = r.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c
      .map(part => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
  return "";
}

interface Reader<T> {
  /** 日志前缀 */
  tag: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** 不按结构返回时追加的一句 */
  jsonHint: string;
  sanitize: (raw: unknown) => T | null;
}

/**
 * 先要求按结构输出；没内容或不是 JSON 时不带结构再要一次，从正文里取 JSON。
 * Gemini 的思考也算在 max_tokens 里：实测 12 件装备正文约 550 token，思考偶尔 1000+，
 * 上限给 4000 时会被截断成空正文，所以给 16384，并把思考压到 low。
 */
async function readImage<T>(dataUrl: string, rd: Reader<T>): Promise<T | null> {
  const messages: InvokeParams["messages"] = [
    {
      role: "user",
      content: [
        { type: "text", text: rd.prompt },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    },
  ];
  const attempts: InvokeParams[] = [
    {
      model: MODEL,
      messages,
      max_tokens: 16384,
      reasoning: { effort: "low" },
      response_format: {
        type: "json_schema",
        json_schema: { name: rd.schemaName, strict: true, schema: rd.schema },
      },
    },
    {
      model: MODEL,
      max_tokens: 16384,
      reasoning: { effort: "low" },
      messages: [...messages, { role: "user", content: rd.jsonHint }],
    },
  ];
  for (const params of attempts) {
    try {
      const r = await invokeLLM(params);
      const text = contentText(r);
      const out = rd.sanitize(extractJson(text));
      if (out) return out;
      // 不记图片和识别内容，只记为什么没取到
      console.warn(
        `[${rd.tag}] no usable JSON:`,
        r.choices?.[0]?.finish_reason,
        "text length",
        text.length
      );
    } catch (e) {
      // 不记图片内容，只记失败原因
      console.warn(`[${rd.tag}] model call failed:`, String(e).slice(0, 200));
    }
  }
  return null;
}

const GEAR: Reader<ScanResult> = {
  tag: "gear-scan",
  prompt: SCAN_PROMPT,
  schemaName: "gear_scan",
  schema: SCAN_SCHEMA,
  jsonHint:
    "只输出一个 JSON 对象，字段是 not_gear、xinfa、score、stone、items（每项 slot、name、refine、gems、enchant、attrs、ilvl），不要别的文字。",
  sanitize: sanitizeScan,
};

const TALENT: Reader<TalentScanResult> = {
  tag: "talent-scan",
  prompt: TALENT_PROMPT,
  schemaName: "talent_scan",
  schema: TALENT_SCHEMA,
  jsonHint: TALENT_JSON_HINT,
  sanitize: sanitizeTalentScan,
};

export const readGear = (dataUrl: string) => readImage(dataUrl, GEAR);
export const readTalents = (dataUrl: string) => readImage(dataUrl, TALENT);

function registerScan<T>(app: Express, path: string, rd: Reader<T>) {
  const limiter = newLimiter();
  app.options(path, (req, res) => {
    cors(req, res);
    res.sendStatus(204);
  });
  app.post(
    path,
    (req, res, next) => {
      cors(req, res);
      res.set("Cache-Control", "no-store");
      next();
    },
    express.json({ limit: "6mb" }),
    async (req, res) => {
      const img = checkImage(req.body);
      if (!img.ok) {
        res
          .status(img.error === "too_large" ? 413 : 400)
          .json({ error: img.error });
        return;
      }
      const wait = limiter.take(clientIp(req));
      if (wait > 0) {
        res.set("Retry-After", String(wait));
        res.status(429).json({ error: "rate_limited", retryAfter: wait });
        return;
      }
      try {
        const result = await withTimeout(
          readImage(img.dataUrl, rd),
          TIMEOUT_MS
        );
        if (!result) {
          res.status(502).json({ error: "failed" });
          return;
        }
        res.json({ ok: true, result });
      } catch {
        res.status(504).json({ error: "timeout" });
      }
    }
  );

  // 请求体太大或不是合法 JSON：返回 JSON 错误，不返回 HTML 错误页
  app.use(
    path,
    (
      err: { type?: string; status?: number },
      req: Request,
      res: Response,
      next: (e?: unknown) => void
    ) => {
      if (!err) return next();
      cors(req, res);
      const tooLarge = err.type === "entity.too.large";
      res
        .status(tooLarge ? 413 : 400)
        .json({ error: tooLarge ? "too_large" : "invalid" });
    }
  );
}

/** 必须在全局 express.json（50 MB）之前注册，这样识别接口只收 6 MB 以内的请求体 */
export function registerGearScanRoutes(app: Express) {
  registerScan(app, "/api/gear-scan", GEAR);
  registerScan(app, "/api/talent-scan", TALENT);
}
