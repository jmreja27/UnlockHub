/** Reescribe una URL de Cloudinary inyectando transformaciones de tamaño. URL no-Cloudinary devuelta intacta. */
export function getCloudinaryThumb(url: string, w: number, h: number): string;
export function getCloudinaryThumb(url: string | null | undefined, w: number, h: number): string | null;
export function getCloudinaryThumb(url: string | null | undefined, w: number, h: number): string | null {
  if (!url) return null;
  if (!url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/w_${w},h_${h},c_fill,q_auto,f_auto/`);
}
