import { useCallback, useEffect, useState, type CSSProperties } from "react";

/** 渐隐宽度（px） */
const FADE = 32;

/**
 * 横向滚动容器的两端渐隐。左边或右边还有没露出的内容时，
 * 那一边淡出 FADE px，提示可以滚动；放得下时不加任何效果。
 *
 * 用回调 ref：容器晚出现（比如先是空状态，换筛选后才有表格）也能接上。
 * mask 画在容器自身的边框盒上，不随内容滚动，所以淡出的总是可见区域的边缘。
 */
export function useScrollFade<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback((node: T) => {
    const max = node.scrollWidth - node.clientWidth;
    const left = node.scrollLeft > 1;
    const right = max - node.scrollLeft > 1;
    setEdges(e => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    if (!el) {
      setEdges({ left: false, right: false });
      return;
    }
    const run = () => update(el);
    run();
    el.addEventListener("scroll", run, { passive: true });
    // 窗口、侧栏宽度变了，或表格内容变宽变窄，都要重算
    const ro = new ResizeObserver(run);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", run);
      ro.disconnect();
    };
  }, [el, update]);

  let style: CSSProperties | undefined;
  if (edges.left || edges.right) {
    const l = edges.left ? FADE : 0;
    const r = edges.right ? FADE : 0;
    const mask = `linear-gradient(to right, ${
      edges.left ? "transparent" : "#000"
    } 0, #000 ${l}px, #000 calc(100% - ${r}px), ${
      edges.right ? "transparent" : "#000"
    } 100%)`;
    // macOS 的 WebView 是 Safari 内核，带前缀的写法也要给
    style = { maskImage: mask, WebkitMaskImage: mask };
  }

  return { ref: setEl, style, edges };
}
