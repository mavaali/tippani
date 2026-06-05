# Implementation Notes

Use the `validateToken()` helper before any protected call.

```js
function validateToken(t) {
  if (!t) throw new Error("missing token");
  return verify(t, SECRET);
}
```

> **Note:** tokens expire after 15 minutes.
> Refresh tokens last 30 days.

Inline `code`, **bold**, and *italic* should all survive.
