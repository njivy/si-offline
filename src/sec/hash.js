import { normalizeSecText } from './normalize.js';

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Bytes(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto required (use a modern browser or Node 19+)');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return bytesToHex(digest);
}

/** @returns {Promise<string>} sha256:<hex> of normalized .sec text */
export async function hashSecText(text) {
  const normalized = normalizeSecText(text);
  const data = new TextEncoder().encode(normalized);
  const hex = await sha256Bytes(data);
  return `sha256:${hex}`;
}
