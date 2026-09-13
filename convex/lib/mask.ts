/**
 * Mask an email address for logs, transcripts, and any surface a human reads.
 *
 * `agent-a@example.com` -> `age…@example.com`
 *
 * The build log is public and transcripts get shared, so addresses are masked
 * everywhere they are displayed. Full values still live in the database, which
 * is where the engine reads them from.
 */
export function maskInbox(inboxId: string): string {
  const at = inboxId.indexOf("@");
  if (at <= 0) return "…";
  return `${inboxId.slice(0, Math.min(3, at))}…${inboxId.slice(at)}`;
}
