import { normalizeSecText } from './normalize.js';

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Bytes(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(digest);
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

/** @returns {Promise<string>} sha256:<hex> of normalized .sec text */
export async function hashSecText(text) {
  const normalized = normalizeSecText(text);
  const data = new TextEncoder().encode(normalized);
  const hex = await sha256Bytes(data);
  return `sha256:${hex}`;
}
