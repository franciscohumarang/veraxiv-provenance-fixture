// Disposable engineering workload fixture. This is not Veraxiv authorization code.
import { createHash } from 'node:crypto';
import { open, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const maximum = 1024 * 1024;
const escape = value => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export function renderDocument(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maximum) throw Error('Document size refused');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/g, '\n');
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) throw Error('Control character refused');
  const title = /^# ([^\n]{1,200})\n/.exec(text)?.[1];
  if (!title || !title.trim()) throw Error('Document needs one bounded opening title');
  const sourceDigest = createHash('sha256').update(bytes).digest('hex');
  const html = Buffer.from(`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title></head><body><main><h1>${escape(title)}</h1><pre>${escape(text)}</pre></main></body></html>\n`);
  return { title, sourceDigest, artifactDigest: createHash('sha256').update(html).digest('hex'), html };
}
export async function buildDocument(source, output) {
  const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maximum) throw Error('Source file refused');
    bytes = await file.readFile();
  } finally { await file.close(); }
  const result = renderDocument(bytes);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'index.html'), result.html);
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ schema_version: '1.0', title: result.title, source_sha256: result.sourceDigest, artifact_sha256: result.artifactDigest }) + '\n');
  return result;
}
export function previewServer(bytes) {
  const html = Buffer.from(bytes);
  return createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    if (!['/', '/index.html'].includes(request.url)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw Error('Usage: build.mjs source.md output-directory');
  const result = await buildDocument(process.argv[2], process.argv[3]);
  console.log(`Built documentation artifact sha256:${result.artifactDigest}`);
}
