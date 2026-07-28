// Spec source map: derive per-block source line ranges for a spec body FROM THE
// RENDER TREE ITSELF (not a parallel line parser). The captured ranges are in
// the same document order and granularity as the file view's commentable
// selector ('p, li, blockquote, table, pre'), so ranges[i] aligns 1:1 with
// commentableEls[i] on the client. That alignment is what anchors the diff
// overlay and comment bubbles to the correct rendered block.
//
// A hand-rolled line parser diverged from the renderer: it keyed on a
// paragraph-only index (so tables/lists/code shifted every anchor) and produced
// an empty map for table/list-only specs (so diffs stacked at the bottom).
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { normalizeMermaidContainers } from "./mermaid-normalize.js";
import { rehypeRewriteImageSrc } from "./image-src.js";

// The tags the client's commentable selector matches, in the same set.
export const COMMENTABLE_TAGS = new Set(["p", "li", "blockquote", "table", "pre"]);
// Headings are commentable only on the read-only spec page (opt-in), so the PR
// review page's block alignment is unchanged.
export const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

// unified plugin: walk the hast tree and push {startLine,endLine} for each
// OUTERMOST commentable block, in document order. It does not descend into a
// matched block — the client marks the outermost matched block commentable and
// skips nested p/li/etc. via `.closest('.commentable')` — so the count and order
// mirror the DOM exactly. With opts.includeHeadings, h1–h6 are matched too.
export function rehypeCollectBlockRanges(ranges, opts = {}) {
  const matches = (tag) => COMMENTABLE_TAGS.has(tag) || (opts.includeHeadings && HEADING_TAGS.has(tag));
  return () => (tree) => {
    const walk = (node) => {
      for (const child of node.children || []) {
        if (child.type === "element" && matches(child.tagName)) {
          const p = child.position || {};
          ranges.push({
            startLine: p.start?.line ?? null,
            endLine: p.end?.line ?? null,
          });
          // Intentionally do NOT recurse into a matched block.
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

// Collect block ranges for a markdown body without rendering to a string.
// Exposed for testing; renderSpecBody is the production path.
export async function collectBlockRanges(content, opts = {}) {
  const ranges = [];
  const proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeCollectBlockRanges(ranges, opts));
  const tree = proc.parse(normalizeMermaidContainers(content));
  await proc.run(tree);
  return ranges;
}

// Render a spec body to sanitized HTML and return the aligned block ranges.
// The range collector runs before sanitize so hast positions are intact; the
// sanitize step preserves the allowed block elements in the same order.
// When `options.rewriteImagesForFileIndex` is set, relative `<img src>` values
// are rewritten to the Tippani image proxy for that file index (before sanitize
// so the root-relative src survives the protocol filter).
export async function renderSpecBody(content, sanitizeSchema, options = {}) {
  const ranges = [];
  let proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeCollectBlockRanges(ranges, { includeHeadings: !!options.includeHeadings }));
  if (options.rewriteImagesForFileIndex != null) {
    proc = proc.use(rehypeRewriteImageSrc(options.rewriteImagesForFileIndex));
  }
  const result = await proc
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeStringify)
    .process(normalizeMermaidContainers(content));
  return { html: String(result), ranges };
}
