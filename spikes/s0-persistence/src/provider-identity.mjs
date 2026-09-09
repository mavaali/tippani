import crypto from "node:crypto";
import { WorkspaceStoreError } from "./workspace-contract.mjs";

const DEFINITIONS = Object.freeze({
  onedrive: Object.freeze({
    url: "https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName",
    headers: Object.freeze({ Accept: "application/json" }),
    subject(body) {
      return body?.id ? `onedrive:${body.id}` : null;
    },
  }),
  ado: Object.freeze({
    url: "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
    headers: Object.freeze({ Accept: "application/json" }),
    subject(body) {
      return body?.id ? `ado:${body.id}` : null;
    },
  }),
  github: Object.freeze({
    url: "https://api.github.com/user",
    headers: Object.freeze({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tippani-s0",
    }),
    subject(body) {
      const id = body?.node_id || body?.id;
      return id ? `github:${id}` : null;
    },
  }),
});

const TOKEN_ENV = Object.freeze({
  onedrive: "S0_ONEDRIVE_TOKEN",
  ado: "S0_ADO_TOKEN",
  github: "S0_GITHUB_TOKEN",
});

function normalizeCredential(credential, provider) {
  const token = typeof credential === "string"
    ? credential
    : credential?.token ?? credential?.accessToken ?? credential?.value;
  if (typeof token !== "string" || !token) {
    throw new WorkspaceStoreError(`No ${provider} credential supplied`, "no_token");
  }
  return token;
}

function credentialFingerprint(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function resolveProviderIdentity({
  provider,
  getToken,
  fetchImpl = globalThis.fetch,
  signal = null,
  identityResolver = null,
  beforeAttempt = null,
  wrapResponse = (response) => response,
} = {}) {
  const definition = DEFINITIONS[provider];
  if (!definition) throw new TypeError(`Unknown provider identity surface: ${provider}`);
  if (typeof getToken !== "function") {
    throw new WorkspaceStoreError(`No ${provider} credential supplied`, "no_token");
  }
  const token = normalizeCredential(await getToken(), provider);
  if (typeof identityResolver === "function") {
    const resolved = await identityResolver({ provider, token, signal });
    const subject = typeof resolved === "string" ? resolved : resolved?.subject;
    if (!subject || typeof subject !== "string") {
      throw new WorkspaceStoreError(
        `${provider} identity resolver returned no stable subject`,
        "identity_unverified",
      );
    }
    return subject;
  }
  await beforeAttempt?.();
  const response = await wrapResponse(await fetchImpl(definition.url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, ...definition.headers },
    signal,
  }), { method: "GET" });
  if (!response.ok) {
    throw new WorkspaceStoreError(
      `${provider} identity resolution failed: ${response.status}`,
      "identity_unverified",
    );
  }
  const body = await response.json();
  const subject = definition.subject(body);
  if (!subject) {
    throw new WorkspaceStoreError(
      `${provider} identity response lacked a stable subject`,
      "identity_unverified",
    );
  }
  return subject;
}

export class ProviderCredentialBinding {
  #approvedIdentity = null;

  constructor({
    provider,
    getToken,
    fetchImpl = globalThis.fetch,
    signal = null,
    identityResolver = null,
    beforeAttempt = null,
    wrapResponse = (response) => response,
  } = {}) {
    this.provider = provider;
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.signal = signal;
    this.identityResolver = identityResolver;
    this.beforeAttempt = beforeAttempt;
    this.wrapResponse = wrapResponse;
    this.identitiesByCredential = new Map();
    this.pinnedCredential = null;
  }

  async readToken() {
    if (typeof this.getToken !== "function") {
      throw new WorkspaceStoreError(`No ${this.provider} credential supplied`, "no_token");
    }
    return normalizeCredential(await this.getToken(), this.provider);
  }

  async issuePinned() {
    const token = await this.readToken();
    const fingerprint = credentialFingerprint(token);
    if (this.pinnedCredential && fingerprint !== this.pinnedCredential) {
      throw new WorkspaceStoreError(
        `${this.provider} credential changed without an approved identity binding`,
        "credential_identity_mismatch",
      );
    }
    this.pinnedCredential = fingerprint;
    return { token, subject: null };
  }

  async issue(expectedIdentity = null) {
    const token = await this.readToken();
    const fingerprint = credentialFingerprint(token);
    let subject = this.identitiesByCredential.get(fingerprint);
    if (!subject) {
      subject = await resolveProviderIdentity({
        provider: this.provider,
        getToken: async () => token,
        fetchImpl: this.fetchImpl,
        signal: this.signal,
        identityResolver: this.identityResolver,
        beforeAttempt: this.beforeAttempt,
        wrapResponse: this.wrapResponse,
      });
    }
    if (expectedIdentity && subject !== expectedIdentity) {
      throw new WorkspaceStoreError(
        `${this.provider} credential identity does not match the approved identity`,
        "credential_identity_mismatch",
      );
    }
    this.identitiesByCredential.set(fingerprint, subject);
    this.pinnedCredential = fingerprint;
    return { token, subject };
  }

  approveIdentity(subject) {
    if (typeof subject !== "string" || !subject) {
      throw new WorkspaceStoreError(
        `${this.provider} approved identity is invalid`,
        "identity_unverified",
      );
    }
    if (this.#approvedIdentity && this.#approvedIdentity !== subject) {
      throw new WorkspaceStoreError(
        `${this.provider} approved identity is immutable`,
        "credential_identity_mismatch",
      );
    }
    this.#approvedIdentity = subject;
    return subject;
  }

  async issueApproved() {
    if (!this.#approvedIdentity) {
      throw new WorkspaceStoreError(
        "Provider credential has not been approved",
        "preflight_required",
      );
    }
    return this.issue(this.#approvedIdentity);
  }

  async resolveIdentity() {
    return (await this.issue()).subject;
  }
}

export async function resolveProviderIdentityForConfig(config, {
  env = process.env,
  identityResolver = config?.identityResolver || null,
  fetchImpl = config?.fetchImpl || globalThis.fetch,
  signal = config?.signal || null,
  beforeAttempt = null,
  wrapResponse = (response) => response,
} = {}) {
  const tokenEnv = TOKEN_ENV[config?.backingPath];
  const explicitToken = {
    onedrive: config?.graphToken,
    ado: config?.adoToken,
    github: config?.githubToken,
  }[config?.backingPath];
  const token = explicitToken || (tokenEnv ? env[tokenEnv] : null);
  return resolveProviderIdentity({
    provider: config?.backingPath,
    getToken: token ? async () => token : config?.getToken,
    fetchImpl,
    signal,
    identityResolver,
    beforeAttempt,
    wrapResponse,
  });
}
