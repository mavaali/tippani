// Pure line diff (LCS). No dependencies, unit-tested in diff.test.mjs. Used by the
// diff-on-save preview (#46) so the user sees exactly what a save will change.

// Diff two strings line-by-line. Returns an ordered list of
// { type: "ctx" | "del" | "add", text } entries. For an in-place change, the
// removed line precedes the added line.
export function diffLines(oldStr, newStr) {
  const a = oldStr.split("\n");
  const b = newStr.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack from the bottom-right, collecting ops in reverse.
  const rev = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rev.push({ type: "ctx", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rev.push({ type: "add", text: b[j - 1] });
      j--;
    } else {
      rev.push({ type: "del", text: a[i - 1] });
      i--;
    }
  }
  return rev.reverse();
}

export function diffStats(diff) {
  let added = 0;
  let removed = 0;
  for (const d of diff) {
    if (d.type === "add") added++;
    else if (d.type === "del") removed++;
  }
  return { added, removed };
}
