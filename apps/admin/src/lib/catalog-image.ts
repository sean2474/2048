export const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;

export function catalogImageType(bytes: Uint8Array, declared: string) {
  if (bytes.length < 4 || bytes.length > MAX_CATALOG_IMAGE_BYTES) return null;
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (declared === "image/png" && bytes.length >= 24 && starts(137, 80, 78, 71, 13, 10, 26, 10))
    return { extension: "png", contentType: declared };
  if (declared === "image/jpeg" && starts(255, 216, 255))
    return { extension: "jpg", contentType: declared };
  if (
    declared === "image/webp" &&
    bytes.length >= 16 &&
    starts(82, 73, 70, 70) &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  )
    return { extension: "webp", contentType: declared };
  return null;
}
