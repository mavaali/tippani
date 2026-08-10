// Timeout wrapper for ADO REST/API calls (clickstop 2, step 9). A wedged network
// call must not hang a request, so every ADO call is bounded: if the promise
// doesn't settle within `ms`, we reject with a timeout error. Pure — wraps any
// promise-returning function, no ADO dependency.
export const DEFAULT_ADO_TIMEOUT_MS = 15000;

export function withTimeout(promise, ms = DEFAULT_ADO_TIMEOUT_MS, label = "ADO call") {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } },
    );
  });
}

// Convenience: run a thunk under the timeout (defers invocation so a throwing
// synchronous fn rejects rather than throws).
export function adoCall(fn, { ms = DEFAULT_ADO_TIMEOUT_MS, label = "ADO call" } = {}) {
  return withTimeout(Promise.resolve().then(fn), ms, label);
}
