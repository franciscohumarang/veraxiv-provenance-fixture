import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderDocument } from './build.mjs';
const input = text => Buffer.from(text);
test('untrusted markup remains escaped text in both title and body', () => {
  const { html } = renderDocument(input('# <script>alert("x")</script>\n\n<img src=x onerror="alert(1)">\n'));
  const result = html.toString();
  assert(!result.includes('<script>')); assert(!result.includes('<img '));
  assert(result.includes('&lt;script&gt;')); assert(result.includes('&quot;'));
});
test('non-ASCII document survives UTF-8 rendering', () => {
  const { html, title } = renderDocument(input('# Résumé 日本語\n\nCrème & café\n'));
  assert.equal(title, 'Résumé 日本語'); assert(html.toString().includes('Crème &amp; café'));
});
test('invalid UTF-8 bytes are refused rather than silently replaced', () => {
  assert.throws(() => renderDocument(Buffer.from([0x23, 0x20, 0xc3, 0x28, 0x0a])));
});
test('oversized, empty and non-byte inputs are refused', () => {
  for (const value of [Buffer.alloc(0), Buffer.alloc(1024*1024+1, 65), '# text\n']) assert.throws(() => renderDocument(value));
});
test('missing headings and embedded control characters are refused', () => {
  for (const value of ['text\n', '# \n', '# Title\n\u0000body', '# '+ 'x'.repeat(201)+'\n']) assert.throws(() => renderDocument(input(value)));
});
test('output is deterministic and digest changes when source bytes change', () => {
  const a = renderDocument(input('# Original\n\nA\n')); const b = renderDocument(input('# Original\n\nA\n')); const changed = renderDocument(input('# Original\n\nB\n'));
  assert.deepEqual(a.html, b.html); assert.equal(a.artifactDigest, b.artifactDigest);
  assert.notEqual(a.artifactDigest, changed.artifactDigest);
  assert.equal(a.artifactDigest, createHash('sha256').update(a.html).digest('hex'));
});
