import express, { type Express, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { feedback } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { RateLimiter, notificationFor, parseFeedback } from "./feedback";

/**
 * 桌面版页面的来源：Mac 是 tauri://localhost，Windows 是 http://tauri.localhost
 * （开了 https 方案时是 https://tauri.localhost）。网页版同源，不需要跨域头。
 */
const DESKTOP_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

const limiter = new RateLimiter();

/**
 * 取限流用的 IP。网站在 Cloudflare 后面，优先用它设置的 CF-Connecting-IP（客户端伪造不了）；
 * 没有时退回 X-Forwarded-For 的第一个。限流只是尽力而为，不当作安全边界。
 */
function clientIp(req: Request) {
  const cf = req.headers["cf-connecting-ip"];
  const cfIp = (Array.isArray(cf) ? cf[0] : cf)?.trim();
  if (cfIp) return cfIp;
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

function cors(req: Request, res: Response) {
  const origin = req.headers.origin;
  if (origin && DESKTOP_ORIGINS.has(origin)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    });
  }
}

/** 必须在全局 express.json（50 MB）之前注册，这样反馈接口只收 16 KB 以内的请求体 */
export function registerFeedbackRoutes(app: Express) {
  app.options("/api/feedback", (req, res) => {
    cors(req, res);
    res.sendStatus(204);
  });

  app.post(
    "/api/feedback",
    (req, res, next) => {
      cors(req, res);
      res.set("Cache-Control", "no-store");
      next();
    },
    express.json({ limit: "16kb" }),
    async (req, res) => {
      const parsed = parseFeedback(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: "invalid", field: parsed.field });
        return;
      }
      if ("spam" in parsed) {
        res.json({ ok: true });
        return;
      }
      const wait = limiter.take(clientIp(req));
      if (wait > 0) {
        res.set("Retry-After", String(wait));
        res.status(429).json({ error: "rate_limited", retryAfter: wait });
        return;
      }
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "unavailable" });
        return;
      }
      const f = parsed.value;
      let id: number;
      try {
        const [result] = await db.insert(feedback).values(f);
        id = result.insertId;
      } catch (error) {
        console.error("[Feedback] Failed to save:", error);
        res.status(500).json({ error: "server" });
        return;
      }
      // 通知失败不影响提交结果：反馈已经存进数据库
      let notified = false;
      try {
        notified = await notifyOwner(notificationFor(id, f, new Date()));
      } catch (error) {
        console.warn("[Feedback] Notification failed:", error);
      }
      if (notified) {
        await db
          .update(feedback)
          .set({ notified: true })
          .where(eq(feedback.id, id))
          .catch(error =>
            console.warn("[Feedback] Failed to mark notified:", error)
          );
      }
      res.json({ ok: true, id });
    }
  );

  // 请求体太大或不是合法 JSON：返回 JSON 错误，不返回 HTML 错误页
  app.use(
    "/api/feedback",
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
        .json({ error: tooLarge ? "too_large" : "invalid", field: "body" });
    }
  );
}
