import fs from "node:fs";

export class CleanupManifest {
  constructor({ runId, ownershipMarker }) {
    if (ownershipMarker !== `tippani-s0:${runId}`) {
      throw new Error("Cleanup ownership marker does not match run ID");
    }
    this.runId = runId;
    this.ownershipMarker = ownershipMarker;
    this.resources = [];
  }

  record(resource) {
    if (!resource?.id || !resource?.kind) throw new TypeError("Cleanup resource id and kind are required");
    if (resource.runId !== this.runId || resource.ownershipMarker !== this.ownershipMarker) {
      throw new Error("Cleanup resource is not owned by this run");
    }
    if (this.resources.some((item) => item.id === resource.id && item.kind === resource.kind)) {
      throw new Error(`Cleanup resource already recorded: ${resource.kind}/${resource.id}`);
    }
    this.resources.push({ ...resource, cleaned: false });
  }

  authorize(resource) {
    return this.resources.some((item) =>
      item.kind === resource.kind &&
      item.id === resource.id &&
      item.runId === resource.runId &&
      item.ownershipMarker === resource.ownershipMarker &&
      item.cleaned === false);
  }

  markCleaned(resource) {
    const item = this.resources.find((candidate) =>
      candidate.kind === resource.kind && candidate.id === resource.id);
    if (!item || !this.authorize(resource)) {
      throw new Error("Refusing cleanup for an unowned or already cleaned resource");
    }
    item.cleaned = true;
  }

  toJSON() {
    return {
      schemaVersion: 1,
      syntheticData: true,
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      resources: this.resources.map((item) => ({ ...item })),
    };
  }

  write(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2) + "\n", "utf8");
  }
}
