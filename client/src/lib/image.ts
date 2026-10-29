/** 头像上传：只在本地处理，裁成正方形后缩到 256×256 */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_MAX_MB = 5;
const OUT = 256;
const MIN_SIDE = 32;

export async function fileToAvatar(file: File): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new Error("只支持 PNG、JPG、WebP 图片");
  }
  if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
    throw new Error(`图片不能超过 ${AVATAR_MAX_MB} MB`);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("图片读不出来，换一张试试"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side < MIN_SIDE) {
      throw new Error(`图片太小，至少 ${MIN_SIDE}×${MIN_SIDE} 像素`);
    }
    // 居中裁成正方形
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("图片读不出来，换一张试试");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
    // 不支持 WebP 的浏览器会自动退回 PNG
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 备注图片：打本记录的备注、避雷的说明里可以贴截图。
 * 原型只在本地处理：长边缩到 1920 以内，转成 WebP。正式版上传到对象存储，
 * 和记录一起按亲友团共享。
 */
export interface NoteImage {
  id: string;
  /** 原型里是 data URL；正式版是存储地址 */
  src: string;
  w: number;
  h: number;
}
export const NOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const NOTE_IMAGE_MAX_MB = 10;
/** 每条记录最多几张 */
export const NOTE_IMAGE_LIMIT = 6;
const NOTE_LONG_EDGE = 1920;

export async function fileToNoteImage(file: File): Promise<NoteImage> {
  if (!NOTE_IMAGE_TYPES.includes(file.type)) {
    throw new Error("只支持 PNG、JPG、WebP 图片");
  }
  if (file.size > NOTE_IMAGE_MAX_MB * 1024 * 1024) {
    throw new Error(`图片不能超过 ${NOTE_IMAGE_MAX_MB} MB`);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("图片读不出来，换一张试试"));
      i.src = url;
    });
    const { naturalWidth: nw, naturalHeight: nh } = img;
    if (!nw || !nh) throw new Error("图片读不出来，换一张试试");
    const k = Math.min(1, NOTE_LONG_EDGE / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * k));
    const h = Math.max(1, Math.round(nh * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("图片读不出来，换一张试试");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return {
      id: `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      src: canvas.toDataURL("image/webp", 0.86),
      w,
      h,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
