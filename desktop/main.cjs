const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require("electron");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { createController } = require("./controller.cjs");
const { validateSetup, saveTarget, loadSetup } = require("./settings.cjs");
const { createAzureAuth } = require("./azure-auth.cjs");

let window, controller, quitting = false;
const azure = createAzureAuth();
let renewal, refreshing = false, starting = false, reviewActive = false, authBusy = false, generation = 0;
function clearAuth() {
  clearInterval(renewal);
  generation++;
  reviewActive = false;
  return azure.stop();
}
const page = pathToFileURL(path.join(__dirname, "index.html")).href;
const home = os.homedir();
app.setName("Tippani");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.show(); window?.focus(); });
  app.on("before-quit", event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    clearAuth().then(() => controller?.stop()).then(() => app.quit()).catch(error => {
      quitting = false;
      dialog.showErrorBox("Tippani could not quit", error.safeMessage || "The review server could not stop. Retry quitting Tippani.");
    });
  });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Tippani", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] },
      { role: "editMenu" },
    ]));
    window = new BrowserWindow({
      width: 720, height: 900, minWidth: 520, minHeight: 580,
      title: "Tippani", autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false,
        contextIsolation: true, sandbox: true, webSecurity: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("will-attach-webview", event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    controller = createController({
      home, openExternal: url => shell.openExternal(url),
      onExit: message => {
        clearAuth().catch(error => {
          if (!window.isDestroyed()) window.webContents.send("desktop-status", error.safeMessage || "Sign-in cleanup failed. Retry stopping the review.");
        });
        if (!window.isDestroyed()) window.webContents.send("desktop-status", message);
      },
    });
    const trusted = event => event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === page;
    function handle(name, handler) {
      ipcMain.handle(name, async (event, input) => {
        if (!trusted(event)) throw new Error("Untrusted launcher request.");
        try { return await handler(input); }
        catch (error) {
          // Only validation/lifecycle messages authored by us reach the UI.
          return { ok: false, error: error.safeMessage || "Tippani could not complete this action. Check the review URL, sign-in and connection, then retry. Reinstall if the problem continues." };
        }
      });
    }
    handle("desktop-load", () => {
      try { return { ok: true, ...loadSetup(home), version: app.getVersion() }; }
      catch { return { ok: false, error: "Saved setup could not be read. Enter your review URL again. Your review data has not been removed." }; }
    });
    async function accounts(signIn) {
      if (reviewActive || starting || authBusy) return { ok: false, error: "Stop the current review or wait for sign-in to finish before choosing another account." };
      authBusy = true;
      try { return { ok: true, accounts: await (signIn ? azure.signIn() : azure.list()) }; }
      finally { authBusy = false; }
    }
    handle("desktop-accounts", () => accounts(false));
    handle("desktop-sign-in", () => accounts(true));
    handle("desktop-pick-local", async () => {
      if (reviewActive || starting || authBusy) return { ok: false, error: "Stop the current review or wait for sign-in to finish before choosing a folder." };
      const result = await dialog.showOpenDialog(window, { title: "Open local Git repository", properties: ["openDirectory"] });
      if (result.canceled || !result.filePaths.length) return { ok: true, cancelled: true };
      try {
        const setup = validateSetup({ mode: "local", localPath: result.filePaths[0] });
        return { ok: true, localPath: setup.localPath };
      } catch (error) { return { ok: false, error: error.message }; }
    });
    handle("desktop-cli-help", async () => {
      await shell.openExternal("https://learn.microsoft.com/cli/azure/install-azure-cli");
      return { ok: true };
    });
    handle("desktop-start", async input => {
      if (starting || authBusy || reviewActive) return { ok: false, error: "Stop the current review or wait for sign-in to finish first." };
      let setup;
      try { setup = validateSetup(input); }
      catch (error) { return { ok: false, error: error.message }; }
      starting = true;
      try {
        if (setup.provider === "ado") setup.credentials.TIPPANI_ADO_TOKEN = await azure.select(setup.account);
        await controller.start(setup);
        reviewActive = true;
        if (setup.provider === "ado") {
          const epoch = generation;
          renewal = setInterval(async () => {
            if (refreshing) return;
            refreshing = true;
            try {
              await azure.refresh(token => {
                if (generation !== epoch) throw new Error("Review stopped.");
                return controller.updateAdoToken(token);
              });
            } catch (error) {
              if (generation === epoch && !window.isDestroyed()) window.webContents.send("desktop-auth-status",
                error.safeMessage || "Azure DevOps sign-in could not renew. Save your edits, stop the review, then sign in again.");
            } finally { refreshing = false; }
          }, 60000);
        }
      } catch (error) {
        await clearAuth();
        return { ok: false, error: error.safeMessage || (setup.provider === "local"
          ? "Could not open the local repository. Check folder access and your Git installation, then retry. No sign-in is needed."
          : "Could not start the review. Check the URL, internet connection, sign-in and repository permissions, then retry. If startup takes over 90 seconds, retry on a working connection.") };
      } finally { starting = false; }
      try { saveTarget(home, setup.target, setup.localPath); }
      catch { return { ok: true, warning: "Review opened, but the URL could not be saved for next time." }; }
      return { ok: true };
    });
    handle("desktop-open", async () => { await controller.open(); return { ok: true }; });
    handle("desktop-stop", async () => { await clearAuth(); await controller.stop(); return { ok: true }; });
    handle("desktop-quit", () => { app.quit(); return { ok: true }; });
    await window.loadFile(path.join(__dirname, "index.html"));
  }).catch(error => {
    console.error("Tippani setup window failed:", error);
    dialog.showErrorBox("Tippani could not start", "The setup window could not open. Quit and reopen Tippani to retry. If this continues, reinstall Tippani from its official release. Your saved review data has not been removed.");
    app.quit();
  });
}
