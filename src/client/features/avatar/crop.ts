import type { Area } from 'react-easy-crop';
export async function cropWebp(source: string, area: Area): Promise<Blob> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('canvas');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 512, 512);
  let blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  if (!blob || blob.type !== 'image/webp') {
    const { encodeWebp } = await import('./webp-encoder');
    blob = await encodeWebp(ctx.getImageData(0, 0, 512, 512));
  }
  if (blob.size > 1048576) throw Error('encode');
  return blob;
}
