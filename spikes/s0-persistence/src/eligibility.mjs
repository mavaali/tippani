// Eligibility is decided over the applicable catalog, not the executed slice.
// Missing applicable gates block eligibility. Gates belonging to another
// engine/backing-path configuration are reported as "Not applicable" and do
// not make an otherwise complete component ineligible.

import { applicableScenarioIds } from "./applicability.mjs";

export function naApprovalErrors(result, { now = Date.now() } = {}) {
  if (result?.status !== "N/A") return [];
  const approval = result.approval;
  const errors = [];
  const rationale = result.contractRationale;
  if (!rationale || typeof rationale !== "object" ||
      rationale.scenarioId !== result.scenarioId ||
      typeof rationale.rationale !== "string" ||
      !rationale.rationale.trim()) {
    errors.push("scenario-specific contract rationale is required");
  }
  if (!approval || typeof approval !== "object") {
    errors.push("structured independent approval");
    return errors;
  }
  if (typeof approval.approver !== "string" || !approval.approver.trim()) {
    errors.push("approver identity is required");
  }
  if (typeof approval.approvedAt !== "string" ||
      !Number.isFinite(Date.parse(approval.approvedAt))) {
    errors.push("approval date is required");
  } else if (Date.parse(approval.approvedAt) > now) {
    errors.push("approval date cannot be in the future");
  }
  if (typeof approval.reference !== "string" || !approval.reference.trim()) {
    errors.push("approval reference is required");
  }
  return errors;
}

export function effectiveResult(result, options = {}) {
  const errors = naApprovalErrors(result, options);
  if (!errors.length) return result;
  return {
    ...result,
    originalStatus: result.status,
    status: "Incomplete",
    reason: `Invalid N/A evidence: ${errors.join("; ")}`,
  };
}

export function gateSummary(run) {
  const applicable = new Set(
    run.applicableScenarioIds ||
    (run.configuration ? applicableScenarioIds(run.configuration) : run.catalog.map((item) => item.id)),
  );
  const absoluteCatalog = run.catalog.filter((scenario) => scenario.criterionType === "absolute");
  const applicableCatalog = absoluteCatalog.filter((scenario) => applicable.has(scenario.id));
  const byId = new Map(run.results.map((result) => [result.scenarioId, result]));
  const recordedAt = Date.parse(run.completedAt || run.startedAt);
  const approvalNow = Number.isFinite(recordedAt) ? recordedAt : Date.now();

  const failed = [];
  const unresolved = [];
  const passed = [];
  const missing = [];
  const na = [];
  const invalidNa = [];
  const notApplicable = [];

  for (const scenario of applicableCatalog) {
    const rawResult = byId.get(scenario.id);
    const result = rawResult ? effectiveResult(rawResult, { now: approvalNow }) : null;
    if (!result) {
      missing.push(scenario);
    } else if (result.status === "Fail") {
      failed.push(result);
    } else if (result.status === "Pass") {
      passed.push(result);
    } else if (result.status === "N/A") {
      na.push(result);
    } else {
      if (result.originalStatus === "N/A") invalidNa.push(result);
      unresolved.push(result);
    }
  }

  for (const scenario of absoluteCatalog) {
    if (!applicable.has(scenario.id)) notApplicable.push(scenario);
  }

  const clean = failed.length === 0 && unresolved.length === 0 && missing.length === 0;
  const eligible = clean ? "Yes" : (failed.length ? "No" : "Incomplete");

  return {
    applicable: applicableCatalog,
    failed,
    unresolved,
    passed,
    missing,
    na,
    invalidNa,
    notApplicable,
    eligible,
  };
}
