function clean(value) {
  return String(value || "").trim();
}

function adoPath(value) {
  const path = clean(value).replace(/\\/g, "/").replace(/^\/+/, "");
  return path ? "/" + path : "";
}

function coordinates(item) {
  return {
    org: clean(item && item.org).replace(/\/+$/, ""),
    project: clean(item && item.project),
    repo: clean(item && item.repo),
    branch: clean(item && item.branch).replace(/^refs\/heads\//, ""),
  };
}

function groupKey(target) {
  return [target.org, target.project, target.repo, target.branch].join("\n");
}

export function planStagedPushes({ branches = [], files = [], folders = [], prs = [] } = {}) {
  const groups = new Map();
  const add = (kind, item) => {
    const target = coordinates(item);
    const missing = Object.entries(target).filter(([, value]) => !value).map(([name]) => name);
    const key = groupKey(target);
    if (!groups.has(key)) groups.set(key, { ...target, stagedBranch: null, files: [], folders: [], prs: [], errors: [] });
    const group = groups.get(key);
    if (missing.length) group.errors.push(`${kind} is missing ${missing.join(", ")}`);
    if (kind === "branch") group.stagedBranch = item;
    else if (kind === "file") group.files.push(item);
    else if (kind === "folder") group.folders.push(item);
    else group.prs.push(item);
  };
  for (const branch of branches || []) add("branch", branch);
  for (const file of files || []) add("file", file);
  for (const folder of folders || []) add("folder", folder);
  for (const pr of prs || []) add("PR", pr);

  return [...groups.values()].map((group) => {
    const adds = group.files.filter((file) => !file.existing).map((file) => ({ path: adoPath(file.path), content: file.content || "" }));
    const edits = group.files.filter((file) => !!file.existing).map((file) => ({ path: adoPath(file.path), content: file.content || "" }));
    const filePaths = group.files.map((file) => adoPath(file.path));
    const folderPaths = group.folders.map((folder) => adoPath(folder.path)).filter(Boolean);
    for (const folderPath of folderPaths) {
      const hasFile = filePaths.some((filePath) => filePath.startsWith(folderPath + "/"));
      const hasChildFolder = folderPaths.some((other) => other !== folderPath && other.startsWith(folderPath + "/"));
      if (!hasFile && !hasChildFolder) adds.push({ path: folderPath + "/.gitkeep", content: "" });
    }
    const bases = [...new Set(group.files.filter((file) => file.existing && file.baseObjectId).map((file) => file.baseObjectId))];
    if (group.files.some((file) => file.existing && !file.baseObjectId)) group.errors.push("an edited file is missing its load-time branch tip");
    if (bases.length > 1) group.errors.push("edited files were loaded from different branch tips");
    if (group.prs.length > 1) group.errors.push("a branch can have only one staged PR intent");
    return { ...group, adds, edits, expectedOldObjectId: bases[0] || null };
  });
}