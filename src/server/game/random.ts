const UINT32_RANGE = 2 ** 32;

export function secureUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Rejection sampling keeps every remainder equally likely. The injected source
// is a server-side test seam, never request data or a client-supplied seed.
export function uniformInteger(
  exclusiveMax: number,
  nextUint32: () => number = secureUint32,
): number {
  if (
    !Number.isSafeInteger(exclusiveMax) ||
    exclusiveMax < 1 ||
    exclusiveMax > UINT32_RANGE
  ) {
    throw new RangeError('exclusiveMax must be an integer from 1 to 2^32.');
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % exclusiveMax);
  for (;;) {
    const value = nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new RangeError('The random source must return a uint32.');
    }
    if (value < limit) return value % exclusiveMax;
  }
}
