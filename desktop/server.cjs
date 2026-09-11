// The IPC pipe is also a lifetime lease: disconnect kills even a server that
// is still authenticating, before index.js installs its own cleanup handlers.
process.on("disconnect", () => process.exit(0));
const timer = setTimeout(() => process.exit(1), 15000);
process.once("message", ({ args, credentials }) => {
  clearTimeout(timer);
  process.argv = [process.execPath, require.resolve("../cli.cjs"), ...args];
  Object.assign(process.env, credentials);
  require("../cli.cjs");
});
