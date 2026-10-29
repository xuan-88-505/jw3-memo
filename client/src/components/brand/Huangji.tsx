import { useId } from "react";

/**
 * 黄鸡表情（照剑三聊天表情重画的矢量版，不是原图）。
 * 共用水滴形的头和头顶卷边，只换脸部。
 * 小于 28px 时省掉眉毛、牙缝这些细节，描边加粗。
 */
export const HUANGJI_MOODS = [
  { key: "laugh", label: "大笑" },
  { key: "smile", label: "微笑" },
  { key: "smug", label: "得意" },
  { key: "love", label: "花痴" },
  { key: "shock", label: "震惊" },
  { key: "sleepy", label: "犯困" },
  { key: "cry", label: "大哭" },
  { key: "angry", label: "生气" },
] as const;

export type HuangjiMood = (typeof HUANGJI_MOODS)[number]["key"];

export function moodLabel(mood: HuangjiMood) {
  return HUANGJI_MOODS.find(m => m.key === mood)?.label ?? "";
}

const INK = "#5A2E0E";
const MOUTH_RED = "#C8141E";
const HEAD =
  "M33 4 C38 10 47 15 53 23 C58 30 60 37 59 44 C57.5 55 46 61 32 61 C18 61 6.5 55 5 44 C4 37 6 30 11 23 C17 15 28 10 33 4 Z";

export function Huangji({
  mood = "laugh",
  size = 22,
  title,
}: {
  mood?: HuangjiMood;
  size?: number;
  /** 传了就作为图片朗读；不传则对读屏隐藏 */
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const small = size < 28;
  const eye = small ? 3.4 : 2.6;
  const blushColor = mood === "angry" ? "#FF5A3D" : "#FF8A3D";
  const showBlush = mood !== "cry" && mood !== "shock";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`hj-head-${uid}`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFF27A" />
          <stop offset="0.55" stopColor="#FFD51C" />
          <stop offset="1" stopColor="#F4AE08" />
        </radialGradient>
      </defs>

      {/* 头：水滴形 */}
      <path
        d={HEAD}
        fill={`url(#hj-head-${uid})`}
        stroke={INK}
        strokeWidth={small ? 4 : 2.8}
        strokeLinejoin="round"
      />
      {/* 头顶卷边 */}
      {small ? (
        <path
          d="M17 23.5 C25 18 40 17.5 48 22"
          fill="none"
          stroke="#D98E00"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M16.5 23.5 C24 17.5 41 16.5 49 21.5 L48 25 C40 20.5 25 21 17.5 27 Z"
          fill="#F2B400"
          stroke={INK}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}

      {showBlush && (
        <>
          <ellipse
            cx="13.2"
            cy="39.5"
            rx="3.6"
            ry="2.3"
            fill={blushColor}
            opacity="0.85"
          />
          <ellipse
            cx="50.8"
            cy="39.5"
            rx="3.6"
            ry="2.3"
            fill={blushColor}
            opacity="0.85"
          />
        </>
      )}

      <Face mood={mood} small={small} eye={eye} uid={uid} />
    </svg>
  );
}

function Face({
  mood,
  small,
  eye,
  uid,
}: {
  mood: HuangjiMood;
  small: boolean;
  eye: number;
  uid: string;
}) {
  const happyEyes = (
    <path
      d="M18.5 35 Q22 29.5 25.5 35 M38.5 35 Q42 29.5 45.5 35"
      fill="none"
      stroke={INK}
      strokeWidth={eye}
      strokeLinecap="round"
    />
  );

  switch (mood) {
    case "laugh": {
      const mouth =
        "M15.5 39.5 Q32 37.5 48.5 39.5 C49 51 42 58 32 58 C22 58 15 51 15.5 39.5 Z";
      return (
        <>
          {!small && (
            <path
              d="M18.5 28.6 L25.5 27.8 M38.5 27.8 L45.5 28.6"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
          {happyEyes}
          <defs>
            <clipPath id={`hj-mouth-${uid}`}>
              <path d={mouth} />
            </clipPath>
          </defs>
          <path d={mouth} fill={MOUTH_RED} />
          <g clipPath={`url(#hj-mouth-${uid})`}>
            <ellipse cx="32" cy="53" rx="12" ry="6.5" fill="#EE3B30" />
            <rect x="14" y="37" width="36" height="6.2" fill="#FFFFFF" />
            <rect x="25" y="53.6" width="14" height="5" fill="#FFFFFF" />
            {!small && (
              <path
                d="M21 39 V43.2 M26.5 38.6 V43.2 M32 38.5 V43.2 M37.5 38.6 V43.2 M43 39 V43.2 M29.7 53.6 V58 M34.3 53.6 V58"
                stroke={INK}
                strokeWidth="0.9"
              />
            )}
          </g>
          <path
            d={mouth}
            fill="none"
            stroke={INK}
            strokeWidth={small ? 3 : 2.4}
            strokeLinejoin="round"
          />
        </>
      );
    }

    case "smile":
      return (
        <>
          {happyEyes}
          <path
            d="M23 44 Q32 52.5 41 44"
            fill="none"
            stroke={INK}
            strokeWidth={small ? 3.4 : 2.8}
            strokeLinecap="round"
          />
        </>
      );

    case "smug":
      return (
        <>
          {/* 半睁的眼：上眼皮一条线，下面半个瞳孔 */}
          <path
            d="M18 32.5 H26.5 M37.5 32.5 H46"
            stroke={INK}
            strokeWidth={eye}
            strokeLinecap="round"
          />
          <path
            d="M19.6 33 A2.9 2.9 0 0 0 25.4 33 Z M39.1 33 A2.9 2.9 0 0 0 44.9 33 Z"
            fill={INK}
          />
          {!small && (
            <path
              d="M38 27.6 Q42 25.6 46 27.4"
              fill="none"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
          {/* 一边嘴角翘起 */}
          <path
            d="M24 47.5 Q33 50.5 41 43"
            fill="none"
            stroke={INK}
            strokeWidth={small ? 3.4 : 2.8}
            strokeLinecap="round"
          />
        </>
      );

    case "love": {
      const heart = (cx: number) =>
        `M${cx} 38.5 C${cx - 6.5} 34 ${cx - 5.5} 28.4 ${cx - 2.4} 28.6 C${cx - 1.1} 28.7 ${cx - 0.3} 29.6 ${cx} 30.6 C${cx + 0.3} 29.6 ${cx + 1.1} 28.7 ${cx + 2.4} 28.6 C${cx + 5.5} 28.4 ${cx + 6.5} 34 ${cx} 38.5 Z`;
      return (
        <>
          <path
            d={`${heart(22)} ${heart(42)}`}
            fill="#FF3B5C"
            stroke={INK}
            strokeWidth={small ? 1.8 : 1.3}
            strokeLinejoin="round"
          />
          <path
            d="M23.5 44 Q32 44.5 40.5 44 Q39.5 53 32 53 Q24.5 53 23.5 44 Z"
            fill={MOUTH_RED}
            stroke={INK}
            strokeWidth={small ? 2.6 : 2.2}
            strokeLinejoin="round"
          />
          <ellipse cx="32" cy="50" rx="4.6" ry="2.4" fill="#EE3B30" />
        </>
      );
    }

    case "shock":
      return (
        <>
          <circle
            cx="22"
            cy="33.5"
            r="5"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth={small ? 2.6 : 2}
          />
          <circle
            cx="42"
            cy="33.5"
            r="5"
            fill="#FFFFFF"
            stroke={INK}
            strokeWidth={small ? 2.6 : 2}
          />
          <circle cx="22" cy="33.8" r={small ? 2.2 : 1.8} fill={INK} />
          <circle cx="42" cy="33.8" r={small ? 2.2 : 1.8} fill={INK} />
          <ellipse
            cx="32"
            cy="48.5"
            rx="4.2"
            ry="5.2"
            fill={MOUTH_RED}
            stroke={INK}
            strokeWidth={small ? 2.6 : 2.2}
          />
          {/* 冷汗 */}
          <path
            d="M51 25 C48.4 29 48 31 50.6 32.6 C53.2 31 52.6 29 51 25 Z"
            fill="#7FD0FF"
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </>
      );

    case "sleepy":
      return (
        <>
          <path
            d="M18 33.5 Q22 37 26 33.5 M38 33.5 Q42 37 46 33.5"
            fill="none"
            stroke={INK}
            strokeWidth={eye}
            strokeLinecap="round"
          />
          <ellipse
            cx="32"
            cy="47"
            rx="2.8"
            ry="2.3"
            fill={MOUTH_RED}
            stroke={INK}
            strokeWidth={small ? 2.2 : 1.8}
          />
          {/* 鼻涕泡 */}
          {!small && (
            <circle
              cx="38.5"
              cy="44"
              r="3.6"
              fill="#BFE6FF"
              fillOpacity="0.85"
              stroke="#5FA8D8"
              strokeWidth="1.1"
            />
          )}
          {/* z z */}
          <path
            d="M47 5.5 H53.5 L47 12 H53.5 M55 13.5 H59 L55 17.5 H59"
            fill="none"
            stroke="#8FB8FF"
            strokeWidth={small ? 2.6 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );

    case "cry":
      return (
        <>
          {/* 挤紧的眼 > < */}
          <path
            d="M18.5 30 L25.5 33.5 L18.5 37 M45.5 30 L38.5 33.5 L45.5 37"
            fill="none"
            stroke={INK}
            strokeWidth={eye}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 两道眼泪 */}
          <path
            d="M21 38 C20 45 19 51 18 58 M43 38 C44 45 45 51 46 58"
            fill="none"
            stroke="#4FB6F5"
            strokeWidth={small ? 4.2 : 3.6}
            strokeLinecap="round"
            opacity="0.92"
          />
          {/* 张大哭的嘴 */}
          <path
            d="M23 51.5 C24.5 42.5 39.5 42.5 41 51.5 C36 49.5 28 49.5 23 51.5 Z"
            fill={MOUTH_RED}
            stroke={INK}
            strokeWidth={small ? 2.6 : 2.2}
            strokeLinejoin="round"
          />
        </>
      );

    case "angry":
      return (
        <>
          <path
            d="M17 28 L26.5 31.5 M47 28 L37.5 31.5"
            stroke={INK}
            strokeWidth={small ? 3.4 : 2.8}
            strokeLinecap="round"
          />
          <ellipse
            cx="22.5"
            cy="36"
            rx={small ? 2.8 : 2.4}
            ry={small ? 3.2 : 2.9}
            fill={INK}
          />
          <ellipse
            cx="41.5"
            cy="36"
            rx={small ? 2.8 : 2.4}
            ry={small ? 3.2 : 2.9}
            fill={INK}
          />
          <path
            d="M24 50 Q32 43.5 40 50"
            fill="none"
            stroke={INK}
            strokeWidth={small ? 3.4 : 2.8}
            strokeLinecap="round"
          />
          {/* 青筋 */}
          <path
            d="M42.5 8.5 q4 0 4 4 M51.5 8.5 q-4 0 -4 4 M42.5 17.5 q4 0 4 -4 M51.5 17.5 q-4 0 -4 -4"
            fill="none"
            stroke="#E5322B"
            strokeWidth={small ? 2.8 : 2.2}
            strokeLinecap="round"
          />
        </>
      );
  }
}
