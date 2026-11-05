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

/**
 * POST /api/gear-scan  { image: "data:image/jpeg;base64,…" }
 * → 200 { ok: true, result: ScanResult }
 * → 400 invalid / 413 too_large / 429 rate_limited / 502 failed / 504 timeout
 *
 * 截图只在这次请求里交给模型读字，不存库、不落盘、不写日志。
 * 实测 gemini-3-flash-preview 读推栏长截图约 6 秒、12 件全对；gemini-3.8-flash 要 18 秒还数错了精炼星数。
 */
const MODEL = "gemini-3-flash-preview";
const TIMEOUT_MS = 45_000;

/** 同一 IP 10 分钟 20 张、24 小时 120 张；只是尽力而为，不当作安全边界 */
const limiter = new RateLimiter([
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

/**
 * 先要求按结构输出；没内容或不是 JSON 时不带结构再要一次，从正文里取 JSON。
 * Gemini 的思考也算在 max_tokens 里：实测 12 件装备正文约 550 token，思考偶尔 1000+，
 * 上限给 4000 时会被截断成空正文，所以给 16384，并把思考压到 low。
 */
export async function readGear(dataUrl: string): Promise<ScanResult | null> {
  const messages: InvokeParams["messages"] = [
    {
      role: "user",
      content: [
        { type: "text", text: SCAN_PROMPT },
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
        json_schema: { name: "gear_scan", strict: true, schema: SCAN_SCHEMA },
      },
    },
    {
      model: MODEL,
      max_tokens: 16384,
      reasoning: { effort: "low" },
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "只输出一个 JSON 对象，字段是 not_gear、xinfa、score、stone、items（每项 slot、name、refine、gems、enchant、attrs、ilvl），不要别的文字。",
        },
      ],
    },
  ];
  for (const params of attempts) {
    try {
      const r = await invokeLLM(params);
      const text = contentText(r);
      const out = sanitizeScan(extractJson(text));
      if (out) return out;
      // 不记图片和识别内容，只记为什么没取到
      console.warn(
        "[gear-scan] no usable JSON:",
        r.choices?.[0]?.finish_reason,
        "text length",
        text.length
      );
    } catch (e) {
      // 不记图片内容，只记失败原因
      console.warn("[gear-scan] model call failed:", String(e).slice(0, 200));
    }
  }
  return null;
}

/** 必须在全局 express.json（50 MB）之前注册，这样识别接口只收 6 MB 以内的请求体 */
export function registerGearScanRoutes(app: Express) {
  app.options("/api/gear-scan", (req, res) => {
    cors(req, res);
    res.sendStatus(204);
  });
  app.post(
    "/api/gear-scan",
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
        const result = await withTimeout(readGear(img.dataUrl), TIMEOUT_MS);
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
    "/api/gear-scan",
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
