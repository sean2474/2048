import assert from "node:assert/strict";
import test from "node:test";
import { catalogImageType, MAX_CATALOG_IMAGE_BYTES } from "../../admin/src/lib/catalog-image";

test("catalog image uploads require matching raster signatures and bounded size", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001", "hex");
  assert.deepEqual(catalogImageType(png, "image/png"), {
    extension: "png",
    contentType: "image/png",
  });
  assert.equal(catalogImageType(png, "image/jpeg"), null);
  assert.equal(
    catalogImageType(Buffer.from('<svg onload="alert(1)"></svg>'), "image/svg+xml"),
    null,
  );
  assert.equal(catalogImageType(Buffer.from("<html>not an image</html>"), "image/png"), null);
  assert.equal(catalogImageType(Buffer.alloc(MAX_CATALOG_IMAGE_BYTES + 1), "image/png"), null);
  assert.equal(catalogImageType(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg"), null);
  assert.deepEqual(catalogImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), {
    extension: "jpg",
    contentType: "image/jpeg",
  });
  assert.deepEqual(
    catalogImageType(Buffer.from("52494646100000005745425056503820", "hex"), "image/webp"),
    { extension: "webp", contentType: "image/webp" },
  );
});
