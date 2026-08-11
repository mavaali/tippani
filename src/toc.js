import GithubSlugger from "github-slugger";

// Build the heading table-of-contents for a markdown body.
//
// Ids are produced with github-slugger — the SAME slugger rehype-slug applies at
// render time, walked in document order — so a TOC anchor (`#id`) always matches
// the rendered heading's id (including github-slugger's duplicate suffixing).
// A prior hand-rolled slug (`replace(/[^\w]+/g, "-")`) collapsed punctuation runs
// differently, so any heading with `/`, `,`, arrows, etc. produced a TOC link
// that pointed at no heading.
//
// Known parity gaps (line-based scan, inherited from the prior implementation):
// a `#` line inside a fenced code block is treated as a heading (phantom TOC
// entry that also consumes a slugger slot, which can shift duplicate suffixes),
// and a heading containing link syntax (`## [Title](url)`) slugs the raw text
// including the URL, while rehype-slug slugs only the rendered text.
export function buildToc(content) {
  const slugger = new GithubSlugger();
  const toc = [];
  for (const line of String(content ?? "").split("\n")) {
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (!hm) continue;
    const text = hm[2].replace(/[*_`\[\]]/g, "");
    toc.push({ id: slugger.slug(text), text, level: hm[1].length });
  }
  return toc;
}
