const REDACTED = "[REDACTED]";

/** Keys that are safe even when they contain "token" in the name. */
const SAFE_KEYS = new Set([
  "errordescription",
  "erroruri",
  "error",
  "expiresat",
  "expiresin",
  "scope",
  "status",
  "tokentype",
  "type",
]);

const SECRET_KEYS = new Set([
  "accesstoken",
  "authorization",
  "clientsecret",
  "code",
  "codeverifier",
  "developertoken",
  "idtoken",
  "musicusertoken",
  "password",
  "passwd",
  "refreshtoken",
  "secret",
]);

function normalizeKey(key: string) {
  return key.replace(/[-_]/g, "").toLowerCase();
}

function isSecretKey(key: string) {
  const normalized = normalizeKey(key);

  if (SAFE_KEYS.has(normalized)) {
    return false;
  }

  if (SECRET_KEYS.has(normalized)) {
    return true;
  }

  return /secret|password|passwd|verifier/.test(normalized) || /token$/.test(normalized);
}

function looksLikeJwt(value: string) {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}

function looksLikeBearerToken(value: string) {
  return /^Bearer\s+\S+/i.test(value.trim());
}

function redactPrimitive(value: string) {
  if (looksLikeBearerToken(value) || looksLikeJwt(value)) {
    return REDACTED;
  }

  return value;
}

function redactValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return redactPrimitive(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = isSecretKey(key) ? REDACTED : redactValue(entry);
  }

  return redacted;
}

/**
 * Deep-redact secrets from values before debug logging.
 * Safe under `DEBUG=*` — tokens/secrets never appear in the sanitized payload.
 */
export function redactForLog<T>(value: T): T {
  return redactValue(value) as T;
}

export const REDACTED_LOG_VALUE = REDACTED;
