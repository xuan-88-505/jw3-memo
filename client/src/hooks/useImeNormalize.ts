import { useRef } from "react";
import type { ChangeEvent, CompositionEvent, KeyboardEvent } from "react";

/**
 * 这次按键是不是输入法在用（确认拼音的回车、取消拼音的 Esc）。
 * Chrome 看 isComposing；Safari 在 compositionend 之后才发 keydown，只能看 keyCode 229。
 */
export function imeBusy(e: KeyboardEvent) {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/**
 * 输入时要整理文字（去空格、限长）的输入框用这个，不要在 onChange 里直接 replace。
 *
 * 输入法组字时，输入框里放的是带空格的拼音（wei man x）。这时把空格去掉再写回去，
 * 浏览器会认为内容被程序改了，把组字打断，拼音当成正式文字提交；输入法接着又塞一遍
 * 整段拼音，就叠成 weimweimaweimanweimanx。所以：
 * - 组字中：原样放进去，不整理；
 * - 选完字（compositionend）和平时打字、粘贴：整理后再放进去。
 *
 * 限长也在这里做，不用 maxLength 属性：有的浏览器内核会把组字中的拼音也算进 maxLength 里截断，
 * 汉字还没选出来拼音就被截掉了。
 */
/** 把状态拿出来，方便在没有 DOM 的环境里单测 */
export function imeHandlers(
  composing: { current: boolean },
  set: (v: string) => void,
  normalize: (v: string) => string = v => v,
  maxLength?: number
) {
  const fix = (v: string) => {
    const n = normalize(v);
    return maxLength == null ? n : n.slice(0, maxLength);
  };
  return {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const inIme =
        composing.current || (e.nativeEvent as InputEvent).isComposing;
      set(inIme ? e.target.value : fix(e.target.value));
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    // Chrome 先发最后一次 input 再发 compositionend，Safari 反过来：两种顺序下，这里都会把选好的字整理一遍
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      composing.current = false;
      set(fix(e.currentTarget.value));
    },
  };
}

export function useImeNormalize(
  set: (v: string) => void,
  normalize?: (v: string) => string,
  maxLength?: number
) {
  const composing = useRef(false);
  return imeHandlers(composing, set, normalize, maxLength);
}
