import { normalizeSecText } from './normalize.js';

function encode(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodeAttr(s) {
  return encode(s).replace(/"/g, '&quot;');
}

function attrsToString(attrs) {
  if (!attrs) return '';
  const keys = Object.keys(attrs).sort();
  if (!keys.length) return '';
  return keys.map((k) => ` ${k}="${encodeAttr(attrs[k])}"`).join('');
}

function writeNode(node) {
  if (typeof node === 'string') return node;
  if (!node || !node.tag) return '';
  const kids = node.children || [];
  const inner = kids.map(writeNode).join('');
  if (!kids.length) return `<${node.tag}${attrsToString(node.attrs)}></${node.tag}>`;
  return `<${node.tag}${attrsToString(node.attrs)}>${inner}</${node.tag}>`;
}

export function serializeSec(sec) {
  const body = writeNode({
    tag: 'SEC',
    attrs: sec.attrs || {},
    children: sec.children || [],
  });
  return normalizeSecText(body);
}

export function serializeOrKeep(originalText, mutated, serializeFn = serializeSec) {
  if (!mutated) return normalizeSecText(originalText);
  return serializeFn(mutated);
}
