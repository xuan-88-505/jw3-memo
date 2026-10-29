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
