import { useCallback, useEffect, useState } from "react";

/** 失败后隔多久在后台再试一次（毫秒）；试完这几次后，只在窗口回到前台或网络恢复时再试 */
const RETRY_DELAYS = [3_000, 10_000, 30_000, 60_000];

/**
 * 图片加载失败时先显示备用内容，再在后台悄悄重试。
 * 典型情况：预览服务休眠、网络断了一下。服务恢复后自动换回图片，不用刷新。
 *
 * 重试用离屏的 Image 去试，成功才把 failed 改回 false，
 * 所以失败期间备用内容不会和空白图片来回闪。
 */
export function useImageRetry(src: string | null | undefined) {
  const [failed, setFailed] = useState(false);

  // 换了图片地址，重新开始
  useEffect(() => setFailed(false), [src]);

  useEffect(() => {
    if (!failed || !src) return;
    let alive = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let probing = false;

    const probe = () => {
      if (!alive || probing) return;
      probing = true;
      const img = new Image();
      img.onload = () => {
        probing = false;
        if (alive) setFailed(false);
      };
      img.onerror = () => {
        probing = false;
        schedule();
      };
      img.src = src;
    };
    const schedule = () => {
      if (!alive || attempt >= RETRY_DELAYS.length) return;
      timer = setTimeout(probe, RETRY_DELAYS[attempt++]);
    };
    const now = () => {
      if (document.visibilityState === "visible") probe();
    };

    schedule();
    window.addEventListener("online", now);
    window.addEventListener("focus", now);
    document.addEventListener("visibilitychange", now);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("online", now);
      window.removeEventListener("focus", now);
      document.removeEventListener("visibilitychange", now);
    };
  }, [failed, src]);

  const onError = useCallback(() => setFailed(true), []);
  return { failed, onError };
}
