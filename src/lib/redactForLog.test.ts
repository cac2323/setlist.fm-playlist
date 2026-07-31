import { describe, expect, it } from "vitest";

import { REDACTED_LOG_VALUE, redactForLog } from "./redactForLog";

describe("redactForLog", () => {
  it("redacts Spotify token fields while keeping diagnostic metadata", () => {
    expect(
      redactForLog({
        access_token: "secret-access",
        refresh_token: "secret-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        error: "invalid_client",
        error_description: "Invalid client secret",
      }),
    ).toEqual({
      access_token: REDACTED_LOG_VALUE,
      refresh_token: REDACTED_LOG_VALUE,
      token_type: "Bearer",
      expires_in: 3600,
      error: "invalid_client",
      error_description: "Invalid client secret",
    });
  });

  it("redacts camelCase and nested secrets", () => {
    expect(
      redactForLog({
        issues: [
          {
            input: {
              accessToken: "nested-secret",
              developerToken: "apple-jwt",
            },
            message: "Invalid",
          },
        ],
      }),
    ).toEqual({
      issues: [
        {
          input: {
            accessToken: REDACTED_LOG_VALUE,
            developerToken: REDACTED_LOG_VALUE,
          },
          message: "Invalid",
        },
      ],
    });
  });

  it("redacts JWT and Bearer string values", () => {
    expect(
      redactForLog({
        note: "Bearer super-secret-token",
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
        safe: "API capacity exceeded",
      }),
    ).toEqual({
      note: REDACTED_LOG_VALUE,
      jwt: REDACTED_LOG_VALUE,
      safe: "API capacity exceeded",
    });
  });
});
