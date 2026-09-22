/** Documented .sec normalizer used before hashing. */

export function normalizeSecText(text) {
  let s = String(text ?? '').replace(/^\uFEFF/, '');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n+$/g, '\n');
  if (!s.endsWith('\n')) s += '\n';
  return s;
}
