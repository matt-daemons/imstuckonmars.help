/** Bounded 256px, 8-bit RGB/RGBA terrain PNG decoder using the Worker stream inflater. */
export async function terrainPng(bytes: ArrayBuffer): Promise<Uint8Array> {
  const view = new DataView(bytes);
  if (
    bytes.byteLength < 33 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a ||
    view.getUint32(16) !== 256 ||
    view.getUint32(20) !== 256 ||
    view.getUint8(24) !== 8 ||
    ![2, 6].includes(view.getUint8(25)) ||
    view.getUint8(26) !== 0 ||
    view.getUint8(27) !== 0 ||
    view.getUint8(28) !== 0
  )
    throw new Error("Unsupported terrain PNG");
  const channels = view.getUint8(25) === 6 ? 4 : 3;
  const parts: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.byteLength;) {
    const length = view.getUint32(offset);
    if (offset + length + 12 > bytes.byteLength) throw new Error("Truncated terrain PNG");
    if (
      pngCrc(new Uint8Array(bytes, offset + 4, length + 4)) !== view.getUint32(offset + length + 8)
    )
      throw new Error("Corrupt terrain PNG chunk");
    if (view.getUint32(offset + 4) === 0x49444154)
      parts.push(new Uint8Array(bytes, offset + 8, length));
    offset += length + 12;
  }
  const stream = new Blob(parts.map((part) => new Uint8Array(part)))
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const stride = 256 * channels;
  const raw = new Uint8Array((stride + 1) * 256);
  let filled = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (filled + value.length > raw.length) {
      await reader.cancel();
      throw new Error("Oversized terrain PNG");
    }
    raw.set(value, filled);
    filled += value.length;
  }
  if (filled !== raw.length) throw new Error("Incomplete terrain PNG");
  const decoded = new Uint8Array(stride * 256);
  for (let row = 0; row < 256; row++) {
    const filter = raw[row * (stride + 1)];
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let col = 0; col < stride; col++) {
      const index = row * stride + col;
      const left = col >= channels ? decoded[index - channels] : 0;
      const up = row ? decoded[index - stride] : 0;
      const upperLeft = row && col >= channels ? decoded[index - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      decoded[index] = (raw[row * (stride + 1) + 1 + col] + predictor) & 255;
    }
  }
  if (channels === 4) return decoded;
  const rgba = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    rgba.set(decoded.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function pngCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
