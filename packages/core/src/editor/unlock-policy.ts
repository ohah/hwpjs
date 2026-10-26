import type { RuntimeReply } from "../contracts.ts";
const passwordErrors = new Set([
  "InvalidPassword",
  "InvalidPasswordUnicode",
  "WrongPasswordOrCorruptPayload",
]);
/** Retry is valid only after an acknowledged, unapplied decoder failure. */
export function retryablePasswordReply(reply: RuntimeReply): boolean {
  return (
    typeof reply.error === "string" &&
    passwordErrors.has(reply.error) &&
    (reply.applied === false || reply.meta?.application === "unapplied") &&
    reply.applied !== true &&
    reply.meta?.application !== "applied" &&
    reply.meta?.changed !== true &&
    reply.changed !== true
  );
}
/** The locked candidate still exists; callers may ask for another password or cancelLoad(). */
export class PasswordAttemptError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "PasswordAttemptError";
  }
}
