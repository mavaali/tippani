// Eligibility is decided over the FULL catalog, not just the executed slice.
// The spike's decision criteria are explicit: "Blocked, Incomplete, or untested
// required gates do not count as passes", and a configuration is eligible only
// when every applicable absolute gate passed. An absolute gate with no result
// is missing evidence, so it blocks eligibility exactly like a Blocked or
// Incomplete one — it must never read as a pass.

export function gateSummary(run) {
  const absoluteCatalog = run.catalog.filter((scenario) => scenario.criterionType === "absolute");
  const byId = new Map(run.results.map((result) => [result.scenarioId, result]));

  const failed = [];
  const unresolved = [];
  const passed = [];
  const missing = [];
  const notApplicable = [];

  for (const scenario of absoluteCatalog) {
    const result = byId.get(scenario.id);
    if (!result) {
      missing.push(scenario);
    } else if (result.status === "Fail") {
      failed.push(result);
    } else if (result.status === "Pass") {
      passed.push(result);
    } else if (result.status === "N/A") {
      // Reviewer-approved not-applicable: the gate does not apply to this
      // configuration's contract, so it neither passes nor blocks eligibility.
      notApplicable.push(result);
    } else {
      // Incomplete or Blocked.
      unresolved.push(result);
    }
  }

  const clean = failed.length === 0 && unresolved.length === 0 && missing.length === 0;
  const eligible = clean ? "Yes" : (failed.length ? "No" : "Incomplete");

  return { failed, unresolved, passed, missing, notApplicable, eligible };
}
