import encode, { init } from '@jsquash/webp/encode.js';
import standard from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import simd from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';
let ready: ReturnType<typeof init> | undefined;
export async function encodeWebp(data: ImageData) {
  ready ??= init({
    locateFile: (path: string) => (path.includes('simd') ? simd : standard),
  });
  try {
    await ready;
  } catch (error) {
    ready = undefined;
    throw error;
  }
  return new Blob([await encode(data, { quality: 85 })], {
    type: 'image/webp',
  });
}
