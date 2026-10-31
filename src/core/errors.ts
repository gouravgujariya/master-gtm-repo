// One error family for the whole backend. API maps AppError.status → HTTP; CLI prints message.

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** A provider key is not set for this client nor globally. Thrown — never process.exit. */
export class MissingKeyError extends AppError {
  constructor(public keyName: string) {
    super(500, "MISSING_KEY", `Missing ${keyName}. Add it to .env (copy from .env.example) or set it for this client.`);
  }
}

/** A third-party API call failed. bodySnippet is truncated so logs never hold full payloads. */
export class ProviderError extends AppError {
  constructor(public provider: string, public httpStatus: number, bodySnippet = "") {
    super(502, "PROVIDER_ERROR", `${provider} -> ${httpStatus}${bodySnippet ? `: ${bodySnippet.slice(0, 300)}` : ""}`);
  }
}
