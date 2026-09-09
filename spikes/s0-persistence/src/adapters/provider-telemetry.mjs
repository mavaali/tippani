import { WorkspaceStoreError } from "../workspace-contract.mjs";

function bytes(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string" || Buffer.isBuffer(value)) return Buffer.byteLength(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Buffer.byteLength(JSON.stringify(value));
}

function declaredContentLength(response) {
  const value = response?.headers?.get?.("content-length");
  if (value === null || value === undefined || !/^\d+$/.test(String(value).trim())) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

function isMutation(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export function retryAfterMilliseconds(response, now = Date.now()) {
  const raw = response?.headers?.get?.("retry-after");
  if (raw === null || raw === undefined) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export class ProviderTelemetry {
  constructor({ safetyBudget = null } = {}) {
    this.safetyBudget = safetyBudget;
    this.requests = 0;
    this.requestBytes = 0;
    this.responseBytes = 0;
    this.throttleResponses = 0;
    this.retries = 0;
    this.retryAfterSeconds = [];
    this.backoffMs = 0;
    this.failures = {};
  }

  async recordRequest(body) {
    await this.safetyBudget?.recordRequest(body);
    this.requests++;
    this.requestBytes += bytes(body);
  }

  recordRetry() {
    this.retries++;
  }

  recordRetryAfter(value, now = Date.now()) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      this.retryAfterSeconds.push(seconds);
      return;
    }
    const at = Date.parse(value);
    if (Number.isFinite(at)) this.retryAfterSeconds.push(Math.max(0, at - now) / 1000);
  }

  recordBackoff(milliseconds) {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) this.backoffMs += value;
  }

  recordFailure(kind) {
    this.failures[kind] = (this.failures[kind] || 0) + 1;
  }

  indeterminateWrite(cause, reason = "transport_failure") {
    this.recordFailure("indeterminate_write");
    const error = new WorkspaceStoreError(
      `Provider mutation may have committed; reconciliation is required (${reason})`,
      "indeterminate_write",
    );
    error.requiresReconciliation = true;
    error.reason = reason;
    error.cause = cause;
    return error;
  }

  async wrapResponse(response, { method = "GET", sent = true } = {}) {
    if (!response || typeof response !== "object") return response;
    if (response.status === 429) {
      this.throttleResponses++;
      this.recordRetryAfter(response.headers?.get?.("retry-after"));
    }
    const indeterminateMutation = sent && isMutation(method);
    const contentLength = declaredContentLength(response);
    if (contentLength !== null && this.safetyBudget?.assertCanConsume) {
      try {
        await this.safetyBudget.assertCanConsume({ bytes: contentLength });
      } catch (error) {
        if (indeterminateMutation) {
          throw this.indeterminateWrite(error, "response_content_length_overrun");
        }
        throw error;
      }
    }
    let bodyCounted = false;
    const countBodyBytes = async (count) => {
      if (!bodyCounted) {
        bodyCounted = true;
        this.responseBytes += count;
        try {
          if (this.safetyBudget?.recordResponseBytes) {
            await this.safetyBudget.recordResponseBytes(count);
          }
        } catch (error) {
          if (indeterminateMutation) {
            throw this.indeterminateWrite(error, "response_body_overrun");
          }
          throw error;
        }
      }
    };
    const consumeBody = async (target, property, args) => {
      let bodyReadStarted = false;
      try {
        if (typeof target.arrayBuffer === "function" &&
            ["json", "text", "arrayBuffer"].includes(property)) {
          bodyReadStarted = true;
          const raw = Buffer.from(await target.arrayBuffer());
          await countBodyBytes(raw.byteLength);
          if (property === "arrayBuffer") {
            return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
          }
          const text = raw.toString("utf8");
          return property === "json" ? JSON.parse(text) : text;
        }
        bodyReadStarted = true;
        const value = await Reflect.apply(target[property], target, args);
        await countBodyBytes(bytes(value));
        return value;
      } catch (error) {
        if (error?.code === "indeterminate_write") throw error;
        if (indeterminateMutation && bodyReadStarted) {
          throw this.indeterminateWrite(error, "response_body_failure");
        }
        throw error;
      }
    };
    return new Proxy(response, {
      get: (target, property) => {
        if (["json", "text", "arrayBuffer"].includes(property) &&
            typeof target[property] === "function") {
          return async (...args) => consumeBody(target, property, args);
        }
        return Reflect.get(target, property, target);
      },
    });
  }

  snapshot() {
    return {
      requests: this.requests,
      requestBytes: this.requestBytes,
      responseBytes: this.responseBytes,
      transferredBytes: this.requestBytes + this.responseBytes,
      throttleResponses: this.throttleResponses,
      retries: this.retries,
      retryAfterSeconds: [...this.retryAfterSeconds],
      backoffMs: this.backoffMs,
      failures: { ...this.failures },
      byteMethod: "UTF-8 application payload bytes submitted or consumed",
    };
  }
}

export function telemetryDelta(before, after) {
  return {
    requests: after.requests - before.requests,
    requestBytes: after.requestBytes - before.requestBytes,
    responseBytes: after.responseBytes - before.responseBytes,
    transferredBytes: after.transferredBytes - before.transferredBytes,
    throttleResponses: after.throttleResponses - before.throttleResponses,
    retries: after.retries - before.retries,
    retryAfterSeconds: after.retryAfterSeconds.slice(before.retryAfterSeconds.length),
    backoffMs: after.backoffMs - before.backoffMs,
  };
}