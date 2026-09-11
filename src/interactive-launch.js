// Pure helpers for the argumentless interactive launch prompt: when `tippani`
// is run with no target and stdin is a TTY, index.js asks for the missing
// values instead of printing usage. Kept separate from index.js (which owns
// the actual readline I/O) so the prompt text and default-handling can be
// unit-tested without a real terminal.

// Renders a question as "Label [default]: " (or "Label: " with no cached
// default to offer).
export function promptLine(label, fallback) {
  const trimmed = fallback == null ? "" : String(fallback).trim();
  return trimmed ? `${label} [${trimmed}]: ` : `${label}: `;
}

// An empty answer (just pressing Enter) keeps the cached default; anything
// else is used as typed, trimmed.
export function resolveAnswer(answer, fallback) {
  const trimmed = String(answer || "").trim();
  return trimmed || (fallback == null ? "" : String(fallback).trim());
}
