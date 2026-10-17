import { PIECE_IMAGE_URLS } from '../web/piece-images.mjs';
import { randomUUID } from 'node:crypto';
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

const MATCH_ERRORS = {
  INVALID_REQUEST: 400, INVALID_SELECTION: 400, INVALID_STATE: 502,
  STALE_REVISION: 409, NOT_YOUR_TURN: 422, ILLEGAL_MOVE: 422,
  PROMOTION_REQUIRED: 422, INVALID_PROMOTION: 422, GAME_OVER: 409, REVISION_EXHAUSTED: 409,
};
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function revision(value) { return Number.isInteger(value) && value >= 0 && value <= 1000000; }
function promotion(value) { return [0, 2, 3, 4, 5].includes(value); }
export function validateMatchEnvelope(value, selected, expectedRevision) {
  if (exact(value, ['ok', 'error']) && value.ok === false) {
    return exact(value.error, ['code', 'message']) && Object.hasOwn(MATCH_ERRORS, value.error.code) &&
      typeof value.error.message === 'string' && value.error.message.length > 0 && value.error.message.length <= 256;
  }
  if (!exact(value, ['ok', 'capsule', 'snapshot']) || value.ok !== true ||
      typeof value.capsule !== 'string' || !value.capsule.startsWith('ZC1|') || value.capsule.length > 16384 ||
      !/^[\x20-\x7e]+$/.test(value.capsule) || value.capsule.includes('~')) return false;
  const s = value.snapshot;
  if (!exact(s, ['schemaVersion', 'mode', 'revision', 'sideToMove', 'inCheck', 'result', 'selected', 'cells', 'moved', 'destinations', 'moves', 'lastMove']) ||
      s.schemaVersion !== 2 || s.mode !== 'match' || s.selected !== selected || !revision(s.revision) ||
      (expectedRevision !== undefined && s.revision !== expectedRevision) || ![1, -1].includes(s.sideToMove) ||
      typeof s.inCheck !== 'boolean' || !['active', 'white-wins', 'black-wins', 'stalemate'].includes(s.result) ||
      !Array.isArray(s.cells) || s.cells.length !== 512 || !s.cells.every(v => Number.isInteger(v) && Math.abs(v) <= 6) ||
      !Array.isArray(s.moved) || s.moved.length !== 512 || !s.moved.every(v => v === 0 || v === 1) ||
      !Array.isArray(s.destinations) || !s.destinations.every((id, i, ids) => isCell(id) && id !== selected && (i === 0 || id > ids[i - 1])) ||
      !Array.isArray(s.moves) || s.moves.length !== s.destinations.length) return false;
  if ((selected === -1 || s.cells[selected] * s.sideToMove <= 0 || s.result !== 'active') && s.moves.length) return false;
  if (!s.moves.every((m, i) => exact(m, ['to', 'kind', 'promotions']) && m.to === s.destinations[i] &&
      ['move', 'capture', 'en-passant', 'castle'].includes(m.kind) && Array.isArray(m.promotions) &&
      (m.promotions.length === 0 || JSON.stringify(m.promotions) === '[2,3,4,5]'))) return false;
  return s.lastMove === null || exact(s.lastMove, ['from', 'to', 'promotion']) &&
    isCell(s.lastMove.from) && isCell(s.lastMove.to) && s.lastMove.from !== s.lastMove.to && promotion(s.lastMove.promotion);
}

async function matchBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw [400, 'INVALID_REQUEST', 'Expected application/json'];
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024) throw [413, 'INVALID_REQUEST', 'Request body is too large'];
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw [400, 'INVALID_REQUEST', 'Invalid JSON']; }
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
  if (PIECE_IMAGE_URLS.includes(pathname)) {
    root = join(ROOT, 'assets');
    path = join(root, pathname.slice('/assets/'.length));
  } else if (pathname.startsWith('/assets/')) {
    send(res, 404, envelope('NOT_FOUND', 'Not found')); return;
  } else if (pathname.startsWith('/vendor/three/')) {
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

export function createServer({ execFileImpl = execFile, timeoutMs = TIMEOUT_MS, queueTimeoutMs = TIMEOUT_MS } = {}) {
  const active = new Set();
  const session = randomUUID();
  let capsule, currentRevision, initialization, closed = false, running = false;
  const queue = [];
  function invoke(operand) {
    if (closed || active.size >= 2) return Promise.reject([503, 'BUSY', 'Faber is busy']);
    return new Promise((resolveChild, reject) => {
      const entry = { child: null };
      active.add(entry);
      try {
        entry.child = execFileImpl(FABER_BINARY, ['run', '--locale', 'en', ROOT, '--', 'match', operand], {
          cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_OUTPUT, killSignal: 'SIGKILL', shell: false,
        }, (error, stdout) => {
          active.delete(entry);
          if (error) {
            const timeout = error.killed && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
            reject([timeout ? 504 : 502, timeout ? 'FABER_TIMEOUT' : 'FABER_FAILURE', timeout ? 'Faber query timed out' : 'Faber query failed']);
            return;
          }
          try { resolveChild(JSON.parse(stdout)); }
          catch { reject([502, 'INVALID_FABER_JSON', 'Faber returned invalid JSON']); }
        });
      } catch { active.delete(entry); reject([502, 'FABER_FAILURE', 'Faber could not start']); }
    });
  }
  async function initializeMatch() {
    if (!initialization) initialization = (async () => {
      const result = await invoke('init');
      if (!validateMatchEnvelope(result, -1, 0) || !result.ok) throw [502, 'INVALID_FABER_JSON', 'Faber could not initialize match'];
      capsule = result.capsule; currentRevision = result.snapshot.revision;
    })();
    return initialization;
  }
  async function dispatch() {
    if (running || !queue.length || closed) return;
    running = true;
    const item = queue.shift();
    clearTimeout(item.timer);
    try {
      await initializeMatch();
      const { action, body, selected } = item;
      if (action !== 'read') {
        if (body.session !== session) throw [409, 'STALE_SESSION', 'Match session has changed'];
        if (body.revision !== currentRevision) throw [409, 'STALE_REVISION', 'Match revision has changed'];
      }
      const operand = action === 'read' ? `read~${selected}~${capsule}` : action === 'new' ?
        `new~${body.revision}~${capsule}` : `move~${body.revision}~${body.from}~${body.to}~${body.promotion}~${capsule}`;
      const result = await invoke(operand);
      const expected = action === 'read' ? currentRevision : currentRevision + 1;
      if (!validateMatchEnvelope(result, selected, expected) || result.ok && action === 'read' && result.capsule !== capsule)
        throw [502, 'INVALID_FABER_JSON', 'Faber returned an invalid match'];
      if (!result.ok) throw [MATCH_ERRORS[result.error.code], result.error.code, result.error.message];
      capsule = result.capsule; currentRevision = result.snapshot.revision;
      send(item.res, 200, { ok: true, session, snapshot: result.snapshot });
    } catch (error) {
      const [status, code, message] = Array.isArray(error) ? error : [502, 'FABER_FAILURE', 'Faber query failed'];
      send(item.res, status, envelope(code, message));
    } finally { running = false; void dispatch(); }
  }
  function enqueue(item) {
    if (closed || queue.length + Number(running) >= 4) { send(item.res, 503, envelope('BUSY', 'Match queue is full')); return; }
    item.timer = setTimeout(() => {
      const index = queue.indexOf(item);
      if (index !== -1) { queue.splice(index, 1); send(item.res, 503, envelope('BUSY', 'Match queue expired')); }
    }, queueTimeoutMs);
    queue.push(item); void dispatch();
  }
  const server = createHttpServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { send(res, 400, envelope('INVALID_REQUEST', 'Invalid URL')); return; }
    if (['/api/match', '/api/match/move', '/api/match/new'].includes(url.pathname)) {
      const action = url.pathname === '/api/match' ? 'read' : url.pathname.endsWith('/move') ? 'move' : 'new';
      if (req.method !== (action === 'read' ? 'GET' : 'POST')) { send(res, 405, envelope('INVALID_REQUEST', 'Unsupported method')); return; }
      if (!localAuthority(req)) { send(res, 400, envelope('INVALID_REQUEST', 'Local Host and Origin required')); return; }
      if (action === 'read') {
        const raw = url.searchParams.get('selected');
        if ([...url.searchParams.keys()].length !== 1 || !/^(?:-1|0|[1-9]\d{0,2})$/.test(raw ?? '') || Number(raw) > 511) {
          send(res, 400, envelope('INVALID_REQUEST', 'Expected one selected value')); return;
        }
        enqueue({ action, selected: Number(raw), res });
      } else {
        try {
          if (url.search) throw [400, 'INVALID_REQUEST', 'Unexpected query'];
          const body = await matchBody(req);
          const keys = action === 'move' ? ['session', 'revision', 'from', 'to', 'promotion'] : ['session', 'revision'];
          if (!exact(body, keys) || typeof body.session !== 'string' || body.session.length > 128 || !revision(body.revision) ||
              action === 'move' && (!isCell(body.from) || !isCell(body.to) || !promotion(body.promotion)))
            throw [400, 'INVALID_REQUEST', 'Invalid match request'];
          enqueue({ action, body, selected: -1, res });
        } catch (error) {
          const [status, code, message] = Array.isArray(error) ? error : [400, 'INVALID_REQUEST', 'Invalid request body'];
          send(res, status, envelope(code, message));
        }
      }
      return;
    }
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
  server.initializeMatch = initializeMatch;
  const close = server.close.bind(server);
  server.close = callback => {
    closed = true;
    for (const item of queue.splice(0)) { clearTimeout(item.timer); send(item.res, 503, envelope('BUSY', 'Server is closing')); }
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

export async function startServer({ port = process.env.PORT ?? '8787', log = console.log, checkCompilerImpl = checkCompiler, ...serverOptions } = {}) {
  if (!/^\d+$/.test(String(port)) || Number(port) > 65535) throw new Error('PORT must be an integer from 0 to 65535');
  await checkCompilerImpl();
  const server = createServer(serverOptions);
  await server.initializeMatch();
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
