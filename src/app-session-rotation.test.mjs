import {
  createAppSessionRotation,
  ROTATION_INTERVAL_MS,
  ROTATION_REFRESH_WINDOW_MS,
} from "./app-session-rotation.js";

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

const HOUR = 60 * 60_000;

function harness({ failPersist = false, clock = 0 } = {}) {
  const state = { clock, minted: 0, persisted: [], revoked: [], warnings: [] };
  const session = { token: "session-0", expiresAt: state.clock + 8 * HOUR };
  const rotation = createAppSessionRotation({
    session,
    createSession: () => {
      state.minted += 1;
      return { token: `session-${state.minted}`, expiresAt: state.clock + 8 * HOUR };
    },
    revokeSession: (token) => state.revoked.push(token),
    persist: (value) => {
      if (failPersist) throw new Error("could not update the portal registry");
      state.persisted.push(value.token);
    },
    now: () => state.clock,
    onWarn: (message) => state.warnings.push(message),
  });
  return { state, rotation };
}

check("interval stays under the refresh window", ROTATION_INTERVAL_MS < ROTATION_REFRESH_WINDOW_MS);

{
  const { state, rotation } = harness();
  check("fresh session is not rotated", rotation.rotateIfDue() === "skipped");
  check("skipped rotation mints nothing", state.minted === 0 && state.revoked.length === 0);
}

{
  const { state, rotation } = harness();
  state.clock += 8 * HOUR - ROTATION_REFRESH_WINDOW_MS + 1;
  check("session inside the refresh window rotates", rotation.rotateIfDue() === "rotated");
  check("replacement is published", state.persisted.at(-1) === "session-1");
  check("rotation exposes the replacement", rotation.current.token === "session-1");
  check("previous token is revoked after publish", state.revoked.includes("session-0"));
  check("replacement is not revoked", !state.revoked.includes("session-1"));
}

{
  // Ordering matters: a failed publish must never revoke the token clients hold.
  const { state, rotation } = harness({ failPersist: true });
  state.clock += 8 * HOUR;
  check("failed publish reports failure", rotation.rotateIfDue() === "failed");
  check("failed publish keeps the old session current", rotation.current.token === "session-0");
  check("failed publish does not revoke the live token", !state.revoked.includes("session-0"));
  check("failed publish revokes the unpublished replacement", state.revoked.includes("session-1"));
  check("failed publish warns without leaking the token",
    state.warnings.length === 1 && !state.warnings[0].includes("session-"));
}

{
  const { state, rotation } = harness();
  rotation.revokeCurrent();
  check("revokeCurrent revokes the live token", state.revoked.at(-1) === "session-0");
}

for (const [name, options] of [
  ["session", { createSession: () => {}, revokeSession: () => {}, persist: () => {} }],
  ["createSession", { session: { token: "t" }, revokeSession: () => {}, persist: () => {} }],
  ["revokeSession", { session: { token: "t" }, createSession: () => {}, persist: () => {} }],
  ["persist", { session: { token: "t" }, createSession: () => {}, revokeSession: () => {} }],
]) {
  let threw = false;
  try { createAppSessionRotation(options); } catch { threw = true; }
  check(`missing ${name} is rejected`, threw);
}

console.log(`app-session-rotation: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
