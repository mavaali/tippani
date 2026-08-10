import { createAdoWorkItemProvider } from "./ado-work-item-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

function fakeConnection() {
  const calls = [];
  const rec = (name, result) => async (...args) => {
    calls.push({ name, args });
    return typeof result === "function" ? result(...args) : result;
  };
  const api = {
    queryByWiql: rec("queryByWiql", { workItems: [{ id: 1 }] }),
    getWorkItems: rec("getWorkItems", [{ id: 1 }]),
    createWorkItem: rec("createWorkItem", { id: 2 }),
    updateWorkItem: rec("updateWorkItem", { id: 2 }),
  };
  const conn = {
    getWorkItemTrackingApi: async () => {
      calls.push({ name: "getWorkItemTrackingApi", args: [] });
      return api;
    },
  };
  return { conn, calls };
}
const last = (calls, name) => [...calls].reverse().find((c) => c.name === name);

{
  let threw = false; try { createAdoWorkItemProvider(null); } catch { threw = true; }
  ok("constructor requires connection", threw);
}
{
  const f = fakeConnection();
  const p = createAdoWorkItemProvider(f.conn);
  eq("query returns refs", await p.queryWorkItemRefs("P", "SELECT"), [{ id: 1 }]);
  eq("query exact SDK args", last(f.calls, "queryByWiql").args, [{ query: "SELECT" }, { project: "P" }]);
  eq("get items", await p.getWorkItems("P", [1], ["System.Title"]), [{ id: 1 }]);
  eq("get items exact SDK args", last(f.calls, "getWorkItems").args,
    [[1], ["System.Title"], undefined, undefined, undefined, "P"]);
  const patch = [{ op: "add" }];
  await p.createWorkItem("P", "Task", patch);
  eq("create exact SDK args", last(f.calls, "createWorkItem").args, [null, patch, "P", "Task"]);
  await p.updateWorkItem(2, patch, "P");
  eq("update exact SDK args", last(f.calls, "updateWorkItem").args, [null, patch, 2, "P"]);
  await p.linkToPullRequest(2, patch);
  eq("link preserves old no-project call shape", last(f.calls, "updateWorkItem").args, [null, patch, 2, undefined]);
  eq("API acquisition reused", f.calls.filter((c) => c.name === "getWorkItemTrackingApi").length, 1);
}

console.log(`\nado-work-item-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
