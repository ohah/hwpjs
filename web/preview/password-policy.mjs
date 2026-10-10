/** Download consent is independent of layout consent and editor readiness. */
export function requirePasswordRemovalConsent(protectionRemoved, consent) {
  if (protectionRemoved && consent !== true) throw new Error("PasswordProtectionRemovalNotAcknowledged");
}
