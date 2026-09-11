const byId = id => document.getElementById(id);
const localMode = () => byId("mode-local").checked;
const status = (message, state = "idle") => {
  byId("status").textContent = message;
  byId("session").dataset.state = state;
  byId("state-label").textContent = { idle: "Ready to connect", busy: "Working", error: "Needs attention", running: "Review open" }[state];
};
function running(value) {
  byId("open").disabled = !value;
  byId("stop").disabled = !value;
  byId("start").disabled = value;
  byId("start").hidden = value;
  byId("session-actions").hidden = !value;
  for (const id of ["accounts", "sign-in", "account", "target", "mode-local", "mode-remote", "pick-local"]) byId(id).disabled = value;
}
function provider() {
  let github = false;
  try { github = new URL(byId("target").value).hostname === "github.com"; } catch {}
  byId("github").hidden = !github;
  byId("azure").hidden = github;
  const local = localMode();
  byId("token").required = !local && github;
  byId("target").required = !local;
  byId("connection").hidden = local;
  byId("remote-target").hidden = local;
  byId("local-target").hidden = !local;
  byId("local-info").hidden = !local;
  byId("review-heading").textContent = local ? "Choose a repository" : "Choose a review";
  byId("start").textContent = local ? "Open local repository in browser" : "Open review in browser";
  byId("provider-label").textContent = local ? "Local only" : github ? "GitHub" : "Azure DevOps / GitHub";
  if (!github || local) byId("token").value = "";
}
for (const id of ["mode-local", "mode-remote"]) byId(id).addEventListener("change", () => {
  provider();
  status(localMode() ? "Choose a repository folder. No account or access token needed." : "Paste a review link to get started.");
});
byId("pick-local").addEventListener("click", async () => {
  byId("pick-local").disabled = true;
  try {
    const result = await window.tippani.pickLocal();
    if (result.cancelled) return;
    if (!result.ok) return status(result.error, "error");
    byId("local-path").value = result.localPath;
    status("Repository selected. Open it to review files locally.");
    byId("start").focus();
  } catch { status("The folder picker could not open. Try again.", "error"); }
  finally { byId("pick-local").disabled = false; }
});
byId("target").addEventListener("input", provider);
window.tippani.load().then(result => {
  if (!result.ok) return status(result.error, "error");
  byId("target").value = result.target;
  byId("local-path").value = result.localPath || "";
  byId(result.mode === "local" ? "mode-local" : "mode-remote").checked = true;
  byId("version").textContent = result.version;
  provider();
});
window.tippani.onStatus(message => { running(false); status(message, "error"); });
window.tippani.onAuthStatus(message => status(message, "error"));
for (const id of ["accounts", "sign-in"]) byId(id).addEventListener("click", async () => {
  for (const control of ["accounts", "sign-in", "start", "mode-local", "mode-remote"]) byId(control).disabled = true;
  status(id === "sign-in" ? "Complete Microsoft sign-in in the browser or account picker. This can take up to three minutes." : "Checking Azure CLI accounts…", "busy");
  try {
    const result = await (id === "sign-in" ? window.tippani.signIn() : window.tippani.accounts());
    byId("account").replaceChildren(new Option("Select an account and tenant", ""));
    if (!result.ok) return status(result.error, "error");
    for (const account of result.accounts) byId("account").add(new Option(`${account.name} — tenant ${account.tenant}`, account.key));
    status(result.accounts.length ? "Select the Microsoft account and tenant you want to use, then Start review." : "No Microsoft user accounts found. Choose Sign in with Microsoft.");
    if (result.accounts.length) byId("account").focus();
  } catch { status("Could not check sign-in. Quit and reopen Tippani to retry.", "error"); }
  finally { for (const control of ["accounts", "sign-in", "start", "mode-local", "mode-remote"]) byId(control).disabled = false; }
});
byId("cli-help").addEventListener("click", () => window.tippani.cliHelp());
byId("setup").addEventListener("submit", async event => {
  event.preventDefault();
  byId("start").disabled = true;
  running(false);
  byId("start").disabled = true;
  const local = localMode();
  for (const id of ["mode-local", "mode-remote", "pick-local"]) byId(id).disabled = true;
  status(local ? "Opening the local repository. No sign-in needed." : "Opening your review… This may take up to 90 seconds. Check sign-in and repository permissions if it fails.", "busy");
  const token = byId("token").value;
  byId("token").value = "";
  try {
    const result = await window.tippani.start({ mode: local ? "local" : "remote", localPath: byId("local-path").value, target: byId("target").value, token, account: byId("account").value });
    running(result.ok);
    status(result.ok ? result.warning || (local ? "Local-only review is open. Notes and edits stay on this computer; nothing is published remotely." : "Review running in your browser. Reopen the browser if the tab closes or sign-in expires.") : result.error, result.ok ? "running" : "error");
    if (result.ok) byId("open").focus();
  } catch { status("The launcher could not start. Quit and reopen Tippani to retry.", "error"); }
  finally { for (const id of ["start", "mode-local", "mode-remote", "pick-local"]) byId(id).disabled = !byId("stop").disabled; }
});
byId("open").addEventListener("click", async () => {
  const result = await window.tippani.open();
  status(result.ok ? "Opened a fresh browser session." : result.error, result.ok ? "running" : "error");
});
byId("stop").addEventListener("click", async () => {
  const result = await window.tippani.stop();
  if (result.ok) running(false);
  status(result.ok ? (localMode() ? "Local review stopped. Saved data is unchanged. Reopen this repository or choose another folder." : "Review stopped. Saved data is unchanged. Check sign-in to start again.") : result.error, result.ok ? "idle" : "error");
  if (result.ok) byId("start").focus();
});
byId("quit").addEventListener("click", () => window.tippani.quit());
