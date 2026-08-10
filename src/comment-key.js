// Reviewing-context key for a one-off .md file (clickstop 2, step 3). A bare file
// has no repo/branch, so its personal comments are keyed by REALPATH under a
// "file:" scheme — a peer of the local:/localorigin: and remote (repo,branch,path)
// keys, so a one-off file's notes never collide with a branch's. Realpath (not the
// raw typed path) is the stable identity, so a symlink or relative alias resolving
// to the same file shares its comments. Pure — no I/O.
export function fileReviewContext(realpath) {
  const p = String(realpath || "");
  return { repo: "file:" + p, branch: "", path: p };
}
