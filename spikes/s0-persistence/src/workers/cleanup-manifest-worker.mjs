import { CleanupManifest } from "../cleanup-manifest.mjs";

function argOf(name) {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : null;
}

const resource = JSON.parse(
  Buffer.from(argOf("resource"), "base64url").toString("utf8"),
);
const manifest = new CleanupManifest({
  runId: resource.runId,
  ownershipMarker: resource.ownershipMarker,
  manifestId: argOf("manifest-id"),
  coordinatesHash: resource.coordinatesHash,
  effectiveTargetHash: resource.effectiveTargetHash,
  manifestNonce: resource.manifestNonce,
  filePath: argOf("file"),
});
manifest.record(resource);
process.stdout.write(`${JSON.stringify(manifest.evidence())}\n`, () => process.exit(9));
