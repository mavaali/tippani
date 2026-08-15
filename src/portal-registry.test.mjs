// Unit tests for the portal instance registry (portal-registry.js).
// Points HOME at a temp dir so no real ~/.tippani is touched.
import fs from "fs";
import os from "os";
import path from "path";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tippani-reg-"));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;

const { writeInstance, removeInstance, listInstances, registryDir, isPidAlive, reapInstances } =
  await import("./portal-registry.js");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

try {
  check("registryDir under home", registryDir().startsWith(tmpHome));
  check("empty registry lists nothing", listInstances().length === 0);

  check("write succeeds", writeInstance({ port: 3847, prId: 111, token: "t1", tokenExpiresAt: 1234, clientName: "mcp", pid: 1001 }) === true);
  writeInstance({ port: 3848, prId: 222, token: "t2", pid: 1002 });

  const all = listInstances();
  check("lists both instances", all.length === 2);
  const a = all.find((i) => i.port === 3847);
  check("entry has prId/token/url", a.prId === 111 && a.token === "t1" && a.url === "http://localhost:3847");
  check("entry has app-session metadata", a.tokenExpiresAt === 1234 && a.clientName === "mcp");

  // index.js treats a false return as fatal (it must not publish a token the
  // registry never accepted), so the failure signal has to be real. A directory
  // where the entry file belongs makes the final rename fail.
  {
    const blocked = path.join(registryDir(), "3999.json");
    fs.mkdirSync(blocked, { recursive: true });
    check("write reports failure instead of throwing",
      writeInstance({ port: 3999, prId: 1, token: "t", pid: 1 }) === false);
    check("failed write leaves no temp file behind",
      !fs.readdirSync(registryDir()).some((f) => f.includes(".tmp")));
    fs.rmSync(blocked, { recursive: true, force: true });
  }

  // Overwrite same port → updates, not duplicates.
  writeInstance({ port: 3847, prId: 999, token: "t1b", pid: 1001 });
  const after = listInstances();
  check("overwrite same port keeps count", after.length === 2);
  check("overwrite updates fields", after.find((i) => i.port === 3847).prId === 999);

  removeInstance(3847);
  const left = listInstances();
  check("remove drops one", left.length === 1 && left[0].port === 3848);

  removeInstance(3847); // idempotent
  check("remove is idempotent", listInstances().length === 1);

  // --- shimPid persistence ---
  writeInstance({ port: 3900, prId: 5, token: "t", pid: 2001, shimPid: 4242 });
  check("writes shimPid", listInstances().find((i) => i.port === 3900).shimPid === 4242);
  writeInstance({ port: 3901, prId: 6, token: "t", pid: 2002 });
  check("shimPid defaults to null", listInstances().find((i) => i.port === 3901).shimPid === null);
  removeInstance(3900); removeInstance(3901);

  // --- isPidAlive ---
  check("isPidAlive: self is alive", isPidAlive(process.pid) === true);
  check("isPidAlive: garbage pid is dead", isPidAlive(2147483646) === false);
  check("isPidAlive: 0/null/NaN are dead", !isPidAlive(0) && !isPidAlive(null) && !isPidAlive("x"));

  // --- reapInstances (async, injected identity) ---
  {
    const killed = [];
    const removed = [];
    const insts = [
      { port: 4000, pid: 100, shimPid: null },  // portal dead -> drop file
      { port: 4001, pid: 200, shimPid: 201 },   // alive, shim dead, port serving -> kill+drop
      { port: 4002, pid: 300, shimPid: 301 },   // portal alive, shim alive -> keep
      { port: 4003, pid: 400, shimPid: null },  // portal alive, no shim -> keep (legacy)
      { port: 4004, pid: 500, shimPid: 501 },   // alive pid (recycled), shim dead, port DEAD -> drop, NO kill
    ];
    const alive = new Set([200, 300, 301, 400, 500]); // 100 dead, 201 dead, 501 dead
    const serving = new Set([4001]); // only the genuine orphan still owns its port
    const reaped = await reapInstances({
      listInstancesFn: () => insts,
      isPidAliveFn: (pid) => alive.has(Number(pid)),
      killPidFn: (pid) => { killed.push(Number(pid)); return true; },
      removeInstanceFn: (port) => { removed.push(Number(port)); },
      confirmPortFn: async (port) => serving.has(Number(port)),
    });
    check("reap: drops dead-portal file", removed.includes(4000) && reaped.find((r) => r.port === 4000)?.reason === "dead-portal");
    check("reap: kills orphan whose port still serves", killed.includes(200) && removed.includes(4001));
    check("reap: orphan reason recorded", reaped.find((r) => r.port === 4001)?.reason === "orphaned");
    check("reap: keeps portal with live shim", !killed.includes(300) && !removed.includes(4002));
    check("reap: keeps legacy portal with no shimPid", !killed.includes(400) && !removed.includes(4003));
    check("reap: recycled-PID orphan dropped WITHOUT kill",
      !killed.includes(500) && removed.includes(4004) &&
      reaped.find((r) => r.port === 4004)?.reason === "orphaned-stale-nokill");
    check("reap: never killed a non-serving pid", killed.length === 1 && killed[0] === 200);
    check("reap: reaped exactly three", reaped.length === 3);
  }
} finally {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
  console.log(`\nportal-registry.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
