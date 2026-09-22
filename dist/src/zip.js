/** Minimal ZIP read/write. Store (0) write; store or deflate-raw read. */

function u16(v, o) {
  return v[o] | (v[o + 1] << 8);
}
function u32(v, o) {
  return (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0;
}
function enc(s) {
  return new TextEncoder().encode(s);
}
function dec(bytes) {
  return new TextDecoder().decode(bytes);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deflate ZIP entries need DecompressionStream');
  }
  const ds = new DecompressionStream('deflate-raw');
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

export async function readZip(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const files = {};
  let i = 0;
  while (i + 30 <= bytes.length) {
    const sig = u32(bytes, i);
    if (sig !== 0x04034b50) break;
    const method = u16(bytes, i + 8);
    const compSize = u32(bytes, i + 18);
    const nameLen = u16(bytes, i + 26);
    const extraLen = u16(bytes, i + 28);
    const name = dec(bytes.subarray(i + 30, i + 30 + nameLen));
    const start = i + 30 + nameLen + extraLen;
    const comp = bytes.subarray(start, start + compSize);
    let data = comp;
    if (method === 8) data = await inflateRaw(comp);
    else if (method !== 0) throw new Error(`Unsupported ZIP method ${method} for ${name}`);
    files[name.replace(/\\/g, '/')] = dec(data);
    i = start + compSize;
  }
  return files;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function putu16(a, o, v) {
  a[o] = v & 255;
  a[o + 1] = (v >> 8) & 255;
}
function putu32(a, o, v) {
  a[o] = v & 255;
  a[o + 1] = (v >> 8) & 255;
  a[o + 2] = (v >> 16) & 255;
  a[o + 3] = (v >>> 24) & 255;
}

export function writeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc(name);
    const data = enc(text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameB.length + data.length);
    putu32(local, 0, 0x04034b50);
    putu16(local, 4, 20);
    putu16(local, 8, 0);
    putu32(local, 14, crc);
    putu32(local, 18, data.length);
    putu32(local, 22, data.length);
    putu16(local, 26, nameB.length);
    local.set(nameB, 30);
    local.set(data, 30 + nameB.length);
    const central = new Uint8Array(46 + nameB.length);
    putu32(central, 0, 0x02014b50);
    putu16(central, 4, 20);
    putu16(central, 6, 20);
    putu32(central, 16, crc);
    putu32(central, 20, data.length);
    putu32(central, 24, data.length);
    putu16(central, 28, nameB.length);
    putu32(central, 42, offset);
    central.set(nameB, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  putu32(end, 0, 0x06054b50);
  putu16(end, 8, locals.length);
  putu16(end, 10, locals.length);
  putu32(end, 12, centralSize);
  putu32(end, 16, offset);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const l of locals) {
    out.set(l, p);
    p += l.length;
  }
  for (const c of centrals) {
    out.set(c, p);
    p += c.length;
  }
  out.set(end, p);
  return out;
}

export function zipToBlob(files) {
  const bytes = writeZip(files);
  return new Blob([bytes], { type: 'application/zip' });
}
