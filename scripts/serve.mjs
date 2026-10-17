import { execFile } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FABER_BINARY = join(ROOT, '.tools/faber/1.12.0/bin/faber');
export const MAX_OUTPUT = 1024 * 1024;
export const TIMEOUT_MS = 10_000;
const LOCAL_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ERROR_STATUS = { UNKNOWN_FIXTURE: 400, INVALID_SELECTION: 400 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function envelope(code, message) { return { ok: false, error: { code, message } }; }
function send(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function isCell(value) { return Number.isInteger(value) && value >= 0 && value < 512; }

export function validateEnvelope(value, fixture, selected) {
  if (!value || typeof value !== 'object') return false;
  if (value.ok === false) return !!value.error && Object.hasOwn(ERROR_STATUS, value.error.code) && typeof value.error.message === 'string';
  if (value.ok !== true || !value.snapshot) return false;
  const s = value.snapshot;
  return s.schemaVersion === 1 && s.fixtureId === fixture && s.selected === selected &&
    Array.isArray(s.fixtures) && s.fixtures.length > 0 && s.fixtures.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(s.fixtures).size === s.fixtures.length && s.fixtures.includes(fixture) &&
    Array.isArray(s.cells) && s.cells.length === 512 && s.cells.every(v => Number.isInteger(v) && Math.abs(v) <= 6) &&
    Array.isArray(s.moved) && s.moved.length === 512 && s.moved.every(v => v === 0 || v === 1) &&
    Array.isArray(s.destinations) && s.destinations.every((id, i, ids) => isCell(id) && id !== selected && (i === 0 || id > ids[i - 1])) &&
    (selected !== -1 && s.cells[selected] !== 0 || s.destinations.length === 0);
}

function localAuthority(req) {
  try {
    if (!req.headers.host || /[\s/@\\]/.test(req.headers.host)) return false;
    const host = new URL(`http://${req.headers.host}`);
    if (!LOCAL_NAMES.has(host.hostname) || host.pathname !== '/' || host.search || host.hash) return false;
    if (req.headers.origin !== undefined) {
      const origin = new URL(req.headers.origin);
      if (origin.origin !== `http://${req.headers.host}` || !LOCAL_NAMES.has(origin.hostname)) return false;
    }
    return true;
  } catch { return false; }
}

function parseQuery(url) {
  if ([...url.searchParams.keys()].some(key => key !== 'fixture' && key !== 'selected')) return null;
  if (url.searchParams.getAll('fixture').length !== 1 || url.searchParams.getAll('selected').length !== 1) return null;
  const fixture = url.searchParams.get('fixture');
  const raw = url.searchParams.get('selected');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(fixture) || !/^(?:-1|0|[1-9]\d{0,2})$/.test(raw)) return null;
  const selected = Number(raw);
  return selected >= -1 && selected < 512 ? { fixture, selected } : null;
}

function contained(root, target) {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

async function staticFile(rawPath, res) {
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { send(res, 400, envelope('INVALID_REQUEST', 'Invalid path')); return; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '..' || part === '.')) {
    send(res, 400, envelope('INVALID_REQUEST', 'Invalid path')); return;
  }
  let root, path;
  if (pathname.startsWith('/vendor/three/')) {
    const asset = pathname.slice('/vendor/three/'.length);
    if (!/^(?:build\/[^/]+|examples\/jsm\/.+)\.js$/.test(asset)) { send(res, 404, envelope('NOT_FOUND', 'Not found')); return; }
    root = join(ROOT, 'node_modules/three');
    path = join(root, asset);
  } else {
    root = join(ROOT, 'web');
    path = join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  }
  try {
    const actualRoot = await realpath(root);
    const actualPath = await realpath(path);
    if (!contained(actualRoot, actualPath) || !(await stat(actualPath)).isFile() || !TYPES[extname(actualPath)]) {
      send(res, 404, envelope('NOT_FOUND', 'Not found')); return;
    }
    const data = await readFile(actualPath);
    if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': TYPES[extname(actualPath)], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (error) {
    send(res, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, envelope('NOT_FOUND', 'File unavailable'));
  }
}

export function createServer({ execFileImpl = execFile, timeoutMs = TIMEOUT_MS } = {}) {
  const active = new Set();
  const server = createHttpServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { send(res, 400, envelope('INVALID_REQUEST', 'Invalid URL')); return; }
    if (req.method !== 'GET') { send(res, 405, envelope('INVALID_REQUEST', 'Only GET is supported')); return; }
    if (url.pathname !== '/api/snapshot') {
      if (url.pathname.startsWith('/api/')) send(res, 404, envelope('NOT_FOUND', 'Not found'));
      else await staticFile(req.url.split('?')[0], res);
      return;
    }
    if (!localAuthority(req)) { send(res, 400, envelope('INVALID_REQUEST', 'Local Host and Origin required')); return; }
    const query = parseQuery(url);
    if (!query) { send(res, 400, envelope('INVALID_REQUEST', 'Expected one fixture and selected value')); return; }
    if (active.size >= 2) { send(res, 503, envelope('BUSY', 'Two queries are already running')); return; }
    const entry = { child: null };
    active.add(entry);
    const disconnect = () => { if (!res.writableEnded) entry.child?.kill('SIGKILL'); };
    res.once('close', disconnect);
    try {
      entry.child = execFileImpl(FABER_BINARY, ['run', '--locale', 'en', ROOT, '--', query.fixture, String(query.selected)], {
        cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_OUTPUT, killSignal: 'SIGKILL', shell: false,
      }, (error, stdout) => {
        active.delete(entry);
        res.off('close', disconnect);
        if (error) {
          const timedOut = error.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
          send(res, timedOut ? 504 : 502, envelope(timedOut ? 'FABER_TIMEOUT' : 'FABER_FAILURE', timedOut ? 'Faber query timed out' : 'Faber query failed'));
          return;
        }
        let result;
        try { result = JSON.parse(stdout); } catch { send(res, 502, envelope('INVALID_FABER_JSON', 'Faber returned invalid JSON')); return; }
        if (!validateEnvelope(result, query.fixture, query.selected)) { send(res, 502, envelope('INVALID_FABER_JSON', 'Faber returned an invalid snapshot')); return; }
        send(res, result.ok ? 200 : ERROR_STATUS[result.error.code], result);
      });
      if (res.destroyed) entry.child.kill('SIGKILL');
    } catch {
      active.delete(entry);
      res.off('close', disconnect);
      send(res, 502, envelope('FABER_FAILURE', 'Faber could not start'));
    }
  });
  const close = server.close.bind(server);
  server.close = callback => {
    for (const entry of active) entry.child?.kill('SIGKILL');
    server.closeAllConnections();
    return close(callback);
  };
  return server;
}

function run(args) {
  return new Promise((resolveRun, reject) => execFile(FABER_BINARY, args, {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, killSignal: 'SIGKILL', shell: false,
  }, (error, stdout) => error ? reject(error) : resolveRun(stdout)));
}

export async function checkCompiler() {
  const version = (await run(['--version'])).trim();
  if (!/^faber 1\.12\.0(?:\s|$)/.test(version)) throw new Error('Expected pinned Faber 1.12.0');
  await run(['check', '--locale', 'en', ROOT]);
}

export async function startServer({ port = process.env.PORT ?? '8787', log = console.log } = {}) {
  if (!/^\d+$/.test(String(port)) || Number(port) > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  await checkCompiler();
  const server = createServer();
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(Number(port), '127.0.0.1', () => { server.off('error', reject); ready(); });
  });
  log(`Ready: http://127.0.0.1:${server.address().port}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startServer();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
  } catch (error) {
    console.error(`Server failed: ${error.message}`);
    process.exitCode = 1;
  }
}
