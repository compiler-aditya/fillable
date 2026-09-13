/**
 * Minimal Svix webhook signature verification.
 *
 * AgentMail signs webhooks with Svix. The official `svix` npm package pulls in
 * Node built-ins, which would force `"use node"` and push this off the default
 * Convex runtime that HTTP actions run on. The scheme is small and stable, so
 * we verify it directly with Web Crypto instead.
 *
 * Signed content is `{svix-id}.{svix-timestamp}.{raw body}`, HMAC-SHA256 with
 * the base64-decoded portion of the `whsec_...` secret, compared base64.
 */

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Length-independent compare, so a mismatch does not leak position by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySvixSignature(opts: {
  secret: string;
  headers: SvixHeaders;
  body: string;
  nowMs: number;
  toleranceMs?: number;
}): Promise<VerifyResult> {
  const { secret, headers, body, nowMs } = opts;
  const tolerance = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS;

  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing svix headers" };
  }

  // Reject replays outside the tolerance window.
  const sentSeconds = Number(headers.timestamp);
  if (!Number.isFinite(sentSeconds)) {
    return { ok: false, reason: "malformed timestamp" };
  }
  const skew = Math.abs(nowMs - sentSeconds * 1000);
  if (skew > tolerance) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(rawSecret);
  } catch {
    return { ok: false, reason: "secret is not valid base64" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${headers.id}.${headers.timestamp}.${body}`;
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent) as unknown as ArrayBuffer,
  );
  const expected = bytesToBase64(new Uint8Array(mac));

  // The header carries a space-separated list, each entry `v1,<base64sig>`.
  // Any match is sufficient — Svix sends several during secret rotation.
  for (const entry of headers.signature.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    const version = entry.slice(0, comma);
    if (version !== "v1") continue;
    if (timingSafeEqual(entry.slice(comma + 1), expected)) return { ok: true };
  }

  return { ok: false, reason: "no matching v1 signature" };
}
