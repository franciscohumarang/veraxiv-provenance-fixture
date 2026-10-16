import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { buildDocument, previewServer } from './build.mjs';
let directory, html, server, origin;
before(async () => {
 directory = await mkdtemp(join(tmpdir(), 'veraxiv-document-qa-'));
 await buildDocument('sandbox/SCENARIO.md', directory);
 html = await readFile(join(directory, 'index.html'));
 server = previewServer(html); server.listen(0, '127.0.0.1'); await once(server, 'listening');
 origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } if (directory) await rm(directory, { recursive: true, force: true }); });
test('built file and source match independently computed manifest digests', async () => {
 const source = await readFile('sandbox/SCENARIO.md'); const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
 assert.equal(manifest.source_sha256, createHash('sha256').update(source).digest('hex'));
 assert.equal(manifest.artifact_sha256, createHash('sha256').update(html).digest('hex'));
 assert(html.toString().includes('Synthetic public documentation fixture'));
});
test('HTTP GET serves the exact built artifact with safe content headers', async () => {
 const response = await fetch(origin + '/'); assert.equal(response.status, 200);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()), html);
 assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
 assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
 assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
});
test('HEAD reports artifact length and sends no body', async () => {
 const response = await fetch(origin + '/index.html', { method: 'HEAD' }); assert.equal(response.status, 200);
 assert.equal(response.headers.get('content-length'), String(html.length)); assert.equal(await response.text(), '');
});
test('mutation methods cannot change the served artifact', async () => {
 for (const method of ['POST', 'PUT', 'DELETE']) { const response = await fetch(origin + '/', { method, body: 'untrusted' }); assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET, HEAD'); await response.arrayBuffer(); }
 const response = await fetch(origin + '/'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), html);
});
test('unlisted paths do not expose local files', async () => {
 for (const path of ['/manifest.json', '/sandbox/SCENARIO.md', '/%2e%2e/private', '/index.html?file=/etc/passwd']) { const response = await fetch(origin + path); assert.equal(response.status, 404); assert.equal(await response.text(), ''); }
});
