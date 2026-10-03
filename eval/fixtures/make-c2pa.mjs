// Signs test images with Content Credentials using the C2PA project's public TEST
// certificate (certs/, from c2pa-rs, MIT/Apache-2.0). These signatures are only
// "trusted" when the test root (certs/test_cert_root_bundle.pem) is loaded as a trust anchor.
// Run from this folder after make_fixtures.py: node make-c2pa.mjs
import fs from "node:fs";
import { Builder, Context, LocalSigner } from "@contentauth/c2pa-node";

const signer = LocalSigner.newSigner(fs.readFileSync("certs/es256.pub"), fs.readFileSync("certs/es256.pem"), "es256");
const DST = "http://cv.iptc.org/newscodes/digitalsourcetype/";

async function sign(input, mimeType, output, actions, generator = "PanPen test fixture") {
  const builder = await Builder.withJsonAsync(
    { claim_generator_info: [{ name: generator, version: "1.0" }], title: output, assertions: [{ label: "c2pa.actions.v2", data: { actions } }] },
    new Context({ verify: { verifyAfterSign: false } }),
  );
  const out = { buffer: null };
  builder.sign(signer, { buffer: fs.readFileSync(input), mimeType }, out);
  fs.writeFileSync(`images/${output}`, out.buffer);
  return out.buffer;
}

const ai = await sign("images/base.jpg", "image/jpeg", "c2pa-ai-generated.jpg", [
  { action: "c2pa.created", digitalSourceType: `${DST}trainedAlgorithmicMedia`, softwareAgent: { name: "Example Image Model" } },
]);
await sign("images/base.jpg", "image/jpeg", "c2pa-ai-edited.jpg", [
  { action: "c2pa.edited", digitalSourceType: `${DST}compositeWithTrainedAlgorithmicMedia`, softwareAgent: { name: "Example Generative Fill" } },
]);
await sign("images/base.jpg", "image/jpeg", "c2pa-camera-capture.jpg", [{ action: "c2pa.created", digitalSourceType: `${DST}digitalCapture` }], "Example Camera App");
await sign("images/plain-no-metadata.png", "image/png", "c2pa-ai-generated.png", [
  { action: "c2pa.created", digitalSourceType: `${DST}trainedAlgorithmicMedia`, softwareAgent: { name: "Example Image Model" } },
]);

// The same AI image after someone changed its pixels without updating the credentials.
const changed = Buffer.from(ai);
changed[changed.length - 600] ^= 0xff;
fs.writeFileSync("images/c2pa-ai-then-altered.jpg", changed);
console.log("signed");
