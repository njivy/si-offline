/**
 * Lightweight SI .sec parser.
 */

const VOIDISH = new Set(['PGE', 'NED', 'EOD', 'END', 'AST']);

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(raw))) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function parseSec(text) {
  const source = String(text ?? '');
  const nodes = [];
  const stack = [{ tag: '#root', attrs: {}, children: nodes }];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\?[\s\S]*?\?>|<\/([A-Za-z][\w.-]*)\s*>|<([A-Za-z][\w.-]*)([^>]*?)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(source))) {
    if (m.index > last) {
      const chunk = source.slice(last, m.index);
      if (chunk) stack[stack.length - 1].children.push(chunk);
    }
    last = m.index + m[0].length;
    if (m[0].startsWith('<!--') || m[0].startsWith('<?') || m[0].startsWith('<!')) continue;
    if (m[1]) {
      const close = m[1].toUpperCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === close) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const tag = m[2].toUpperCase();
    const attrs = parseAttrs(m[3] || '');
    const selfClose = Boolean(m[4]) || VOIDISH.has(tag);
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (last < source.length) {
    const chunk = source.slice(last);
    if (chunk) stack[stack.length - 1].children.push(chunk);
  }

  const sec = nodes.find((n) => n && n.tag === 'SEC') || {
    tag: 'SEC',
    attrs: {},
    children: nodes,
  };
  return decorate(sec, source);
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || !node.children) return '';
  return node.children.map(textOf).join('');
}

function first(node, tag) {
  if (!node || !node.children) return null;
  return node.children.find((c) => c && c.tag === tag) || null;
}

function all(node, tag, acc = []) {
  if (!node || typeof node === 'string') return acc;
  if (node.tag === tag) acc.push(node);
  for (const c of node.children || []) all(c, tag, acc);
  return acc;
}

function decorate(sec, source) {
  const scn = textOf(first(sec, 'SCN')).replace(/\s+/g, ' ').trim();
  const stl = textOf(first(sec, 'STL')).replace(/\s+/g, ' ').trim();
  const dte = textOf(first(sec, 'DTE')).replace(/\s+/g, ' ').trim();
  const pra = textOf(first(sec, 'PRA')).replace(/\s+/g, ' ').trim();
  return {
    tag: 'SEC',
    attrs: sec.attrs || {},
    children: sec.children || [],
    number: scn || guessNumberFromSource(source),
    title: stl,
    date: dte,
    preparingActivity: pra,
    rids: all(sec, 'RID').map((n) => textOf(n).replace(/\s+/g, ' ').trim()).filter(Boolean),
    subs: all(sec, 'SUB').map((n) => textOf(n).replace(/\s+/g, ' ').trim()).filter(Boolean),
    srfs: all(sec, 'SRF').map((n) => textOf(n).replace(/\s+/g, ' ').trim()).filter(Boolean),
  };
}

function guessNumberFromSource(source) {
  const m = source.match(/<SCN>\s*([^<]+?)\s*<\/SCN>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

export function walk(node, fn, parent = null) {
  if (!node || typeof node === 'string') return;
  fn(node, parent);
  for (const c of node.children || []) walk(c, fn, node);
}

export function textContent(node) {
  return textOf(node);
}

export { first, all };
