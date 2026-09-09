const LOCAL = Object.freeze([
  "S0-ATM-001", "S0-ATM-002", "S0-ATM-003",
  "S0-CON-001", "S0-CON-002", "S0-CON-003", "S0-CON-004", "S0-CON-005",
  "S0-JRN-001", "S0-JRN-002",
  "S0-CRS-001", "S0-CRS-002", "S0-CRS-003",
  "S0-COL-001",
  "S0-BCK-001",
  "S0-COR-001", "S0-COR-002", "S0-COR-003", "S0-COR-004",
  "S0-HYD-001", "S0-HYD-002", "S0-HYD-003",
  "S0-MIG-001", "S0-MIG-002", "S0-MIG-003",
  "S0-IMP-001", "S0-IMP-002",
  "S0-BKP-001", "S0-BKP-002",
  "S0-REC-001", "S0-REC-002", "S0-REC-005",
  "S0-SEC-001", "S0-SEC-002", "S0-SEC-003",
  "S0-SEC-004", "S0-SEC-005", "S0-SEC-006",
  "S0-PER-001", "S0-PER-002", "S0-PER-003", "S0-PER-005",
]);

const SHARED_PROVIDER = Object.freeze([
  "S0-COL-002", "S0-COL-003", "S0-COL-004", "S0-COL-005", "S0-COL-006",
  "S0-BCK-005",
  "S0-MIG-004",
  "S0-BKP-003", "S0-BKP-004",
  "S0-REC-003", "S0-REC-004",
  "S0-SEC-001", "S0-SEC-002", "S0-SEC-003",
  "S0-SEC-004", "S0-SEC-005", "S0-SEC-006",
  "S0-PER-004", "S0-PER-005",
]);

function withProviderSpecific(...ids) {
  return Object.freeze([...SHARED_PROVIDER, ...ids]);
}

export const APPLICABILITY_PROFILES = Object.freeze({
  local: LOCAL,
  onedrive: withProviderSpecific("S0-BCK-002", "S0-BCK-006"),
  ado: withProviderSpecific("S0-BCK-003"),
  github: withProviderSpecific("S0-BCK-004"),
});

export const CONFIGURATION_MATRIX = Object.freeze([
  Object.freeze({
    configurationId: "CFG-LOCAL-SQLITE",
    label: "Local SQLite",
    engine: "SQLite",
    backingPath: "Local filesystem",
    profile: "local",
  }),
  Object.freeze({
    configurationId: "CFG-LOCAL-CAS",
    label: "Local generation-CAS envelope",
    engine: "Generation-CAS envelope",
    backingPath: "Local filesystem",
    profile: "local",
  }),
  Object.freeze({
    configurationId: "CFG-ONEDRIVE-LIVE",
    label: "OneDrive generation-CAS envelope",
    engine: "Generation-CAS envelope",
    backingPath: "OneDrive",
    profile: "onedrive",
  }),
  Object.freeze({
    configurationId: "CFG-ADO-LIVE",
    label: "ADO generation-CAS envelope",
    engine: "Generation-CAS envelope",
    backingPath: "Azure DevOps repository",
    profile: "ado",
  }),
  Object.freeze({
    configurationId: "CFG-GITHUB-LIVE",
    label: "GitHub generation-CAS envelope",
    engine: "Generation-CAS envelope",
    backingPath: "GitHub repository",
    profile: "github",
  }),
]);

export const ARCHITECTURE_MAPPINGS = Object.freeze([
  Object.freeze({
    id: "MAP-HYBRID-SQLITE",
    label: "Hybrid SQLite + provider-native CAS",
    components: Object.freeze([
      "CFG-LOCAL-SQLITE",
      "CFG-ONEDRIVE-LIVE",
      "CFG-ADO-LIVE",
      "CFG-GITHUB-LIVE",
    ]),
  }),
  Object.freeze({
    id: "MAP-ENVELOPE",
    label: "Generation-CAS envelope on every backing path",
    components: Object.freeze([
      "CFG-LOCAL-CAS",
      "CFG-ONEDRIVE-LIVE",
      "CFG-ADO-LIVE",
      "CFG-GITHUB-LIVE",
    ]),
  }),
]);

export function applicabilityProfile(config) {
  if (config?.applicabilityProfile) return config.applicabilityProfile;
  if (["onedrive", "ado", "github"].includes(config?.backingPath)) {
    return config.backingPath;
  }
  return "local";
}

export function applicableScenarioIds(config) {
  if (Array.isArray(config?.applicableScenarioIds)) {
    return [...config.applicableScenarioIds];
  }
  if (config?.adapter === "reference-memory" && Array.isArray(config.scenarioIds)) {
    return [...config.scenarioIds];
  }
  const profile = applicabilityProfile(config);
  const ids = APPLICABILITY_PROFILES[profile];
  if (!ids) throw new Error(`Unknown S0 applicability profile: ${profile}`);
  return [...ids];
}

export function validateApplicability(catalog) {
  const known = new Set(catalog.map((scenario) => scenario.id));
  const assigned = new Set();
  for (const [profile, ids] of Object.entries(APPLICABILITY_PROFILES)) {
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate) throw new Error(`Duplicate ${profile} applicability ID: ${duplicate}`);
    for (const id of ids) {
      if (!known.has(id)) throw new Error(`Unknown ${profile} applicability ID: ${id}`);
      assigned.add(id);
    }
  }
  const unassigned = catalog.filter((scenario) => !assigned.has(scenario.id));
  if (unassigned.length) {
    throw new Error(`Scenarios have no applicability profile: ${unassigned.map((item) => item.id).join(", ")}`);
  }
  return true;
}

export function configurationDefinition(configurationId) {
  return CONFIGURATION_MATRIX.find((item) => item.configurationId === configurationId) || null;
}