/*
 * Signed values in RGBA8 textures (WebGL1 needs no float-texture extension this way).
 * 0 encodes to exactly 128, so a flat sea is exactly representable and decodes to exactly 0.
 */
export const ENC = Object.freeze({ zero: 128, scale: 127 });

/** x in [-1, 1] (clamped) to a byte. */
export function encodeSigned(x) {
  const c = x > 1 ? 1 : x < -1 ? -1 : x;
  return Math.round(ENC.zero + (c || 0) * ENC.scale); // `|| 0` turns NaN into a flat sea instead of a black byte
}

export const decodeSigned = (byte) => (byte - ENC.zero) / ENC.scale;

/** A texture at rest: signed channels at 128 (zero), alpha 0 (no foam). */
export function restBytes(w, h) {
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = ENC.zero;
    bytes[i + 1] = ENC.zero;
    bytes[i + 2] = ENC.zero;
  }
  return bytes;
}
