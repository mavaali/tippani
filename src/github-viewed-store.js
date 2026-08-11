// Durable private GitHub viewed-state. GitHub has no notification-free PR
// property equivalent to ADO's tippani.viewed, so state stays local per user.

import fs from "node:fs";
import path from "node:path";

export function createGitHubViewedStore(filePath, { fsImpl = fs } = {}) {
  if (!filePath) throw new Error("GitHub viewed store requires a file path");

  function loadAll() {
    if (!fsImpl.existsSync(filePath)) return {};
    const raw = fsImpl.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Corrupt GitHub viewed-state store");
    }
    return parsed;
  }

  function saveAll(data) {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fsImpl.writeFileSync(tmp, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    fsImpl.renameSync(tmp, filePath);
  }

  return {
    read: async (key) => {
      const all = loadAll();
      const value = all[key];
      if (value == null) return {};
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Corrupt GitHub viewed state for ${key}`);
      }
      return { ...value };
    },
    write: async (key, map) => {
      const all = loadAll();
      all[key] = { ...(map || {}) };
      saveAll(all);
    },
  };
}
