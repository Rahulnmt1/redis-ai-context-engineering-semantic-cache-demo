/** Float32 little-endian blob for RediSearch VECTOR fields. */
export function floatsToBuffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i], i * 4);
  }
  return buf;
}
