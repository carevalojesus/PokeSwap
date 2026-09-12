import decode, { init } from '@jsquash/webp/decode.js';
import wasm from '@jsquash/webp/codec/dec/webp_dec.wasm';

export class MediaError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 409 | 413 | 415 | 503 = 400,
  ) {
    super(code);
  }
}
let ready: Promise<void> | undefined;
export async function validateWebp(bytes: ArrayBuffer) {
  if (bytes.byteLength > 1_048_576)
    throw new MediaError('IMAGE_TOO_LARGE', 413);
  const b = new Uint8Array(bytes),
    v = new DataView(bytes);
  const text = (at: number, n: number) =>
    String.fromCharCode(...b.subarray(at, at + n));
  const invalid = () => new MediaError('INVALID_IMAGE');
  if (
    b.length < 20 ||
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WEBP' ||
    v.getUint32(4, true) + 8 !== b.length
  )
    throw invalid();
  let at = 12,
    frames = 0,
    width = 0,
    height = 0;
  while (at < b.length) {
    if (at + 8 > b.length) throw invalid();
    const kind = text(at, 4),
      size = v.getUint32(at + 4, true),
      start = at + 8;
    if (start + size + (size % 2) > b.length) throw invalid();
    if (kind === 'VP8X') {
      if (
        at !== 12 ||
        size !== 10 ||
        (b[start] & ~0x30) !== 0 ||
        b[start + 1] ||
        b[start + 2] ||
        b[start + 3]
      )
        throw invalid();
      const u24 = (i: number) => b[i] + b[i + 1] * 256 + b[i + 2] * 65536;
      if (u24(start + 4) + 1 !== 512 || u24(start + 7) + 1 !== 512)
        throw invalid();
    } else if (kind === 'VP8 ') {
      if (size < 10 || b[start] & 1 || text(start + 3, 3) !== '\x9d\x01\x2a')
        throw invalid();
      width = v.getUint16(start + 6, true) & 0x3fff;
      height = v.getUint16(start + 8, true) & 0x3fff;
      frames++;
    } else if (kind === 'VP8L') {
      if (size < 5 || b[start] !== 0x2f) throw invalid();
      const bits = v.getUint32(start + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      if (bits >>> 29) throw invalid();
      frames++;
    } else if (kind === 'ICCP') {
      if (
        size < 128 ||
        size > 4096 ||
        v.getUint32(start, false) !== size ||
        text(start + 36, 4) !== 'acsp'
      )
        throw invalid();
    } else if (kind !== 'ALPH') throw invalid(); // No animation, EXIF, XMP or unknown payloads.
    at = start + size + (size % 2);
  }
  if (frames !== 1 || width !== 512 || height !== 512) throw invalid();
  try {
    ready ??= init({
      instantiateWasm(
        imports: WebAssembly.Imports,
        callback: (instance: WebAssembly.Instance) => void,
      ) {
        const instance = new WebAssembly.Instance(wasm, imports);
        callback(instance);
        return instance.exports;
      },
    });
    await ready;
    const decoded = await decode(bytes);
    if (
      decoded.width !== 512 ||
      decoded.height !== 512 ||
      decoded.data.length !== 512 * 512 * 4
    )
      throw invalid();
  } catch {
    throw invalid();
  }
}
export async function readImage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError('INVALID_IMAGE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_048_576) {
        await reader.cancel();
        throw new MediaError('IMAGE_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result.buffer;
}
