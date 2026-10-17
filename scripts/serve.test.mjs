import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { PIECE_IMAGE_URLS } from '../web/piece-images.mjs';
import { once } from 'node:events';
import { FABER_BINARY, MAX_OUTPUT, ROOT, createServer, startServer, validateEnvelope } from './serve.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }
async function json(url, options) {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json(), headers: response.headers };
}
function mockExec(mode, record = {}) {
  return (file, args, options, callback) => {
    record.file = file; record.args = args; record.options = options;
    const script = mode === 'timeout' || mode === 'hold' ? 'setInterval(() => {}, 1000)' :
      mode === 'overflow' ? `process.stdout.write('x'.repeat(${MAX_OUTPUT + 1}))` :
      mode === 'invalid' ? 'process.stdout.write("not JSON")' :
      mode === 'schema' ? 'process.stdout.write(JSON.stringify({ok:true,snapshot:{}}))' :
      'process.stderr.write("private diagnostic"); process.exit(7)';
    const child = execFile(process.execPath, ['-e', script], options, callback);
    record.child = child;
    return child;
  };
}

// Test snapshots are boundary fixtures only; production data always comes from Faber.
function snapshot() {
  return { ok: true, snapshot: { schemaVersion: 1, fixtureId: 'test', fixtures: ['test'], selected: -1, cells: Array(512).fill(0), moved: Array(512).fill(0), destinations: [] } };
}

test('snapshot boundary rejects incomplete, invalid and unsorted data', () => {
  assert.equal(validateEnvelope(snapshot(), 'test', -1), true);
  for (const mutate of [s => s.cells.pop(), s => s.cells[0] = 7, s => s.moved[0] = 2, s => s.destinations = [1, 1], s => s.destinations = [3, 2], s => s.selected = null, s => s.fixtures = []]) {
    const value = snapshot(); mutate(value.snapshot);
    assert.equal(validateEnvelope(value, 'test', -1), false);
  }
  assert.equal(validateEnvelope({ ok: false, error: { code: 'UNKNOWN_FIXTURE', message: 'Unknown fixture' } }, 'test', -1), true);
  assert.equal(validateEnvelope({ ok: false, error: { code: 'OTHER', message: 'Unknown' } }, 'test', -1), false);
});

test('actual pinned Faber serves complete current-source snapshots and semantic errors', async () => {
  const server = createServer();
  const base = await listen(server);
  try {
    const first = await json(`${base}/api/snapshot?fixture=initial&selected=-1`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'application/json');
    assert.equal(first.headers.get('access-control-allow-origin'), null);
    assert.equal(validateEnvelope(first.body, 'initial', -1), true);
    assert.equal(first.body.snapshot.cells.filter(Boolean).length, 48);
    assert.deepEqual(first.body.snapshot.destinations, []);
    const empty = first.body.snapshot.cells.indexOf(0);
    const selected = await json(`${base}/api/snapshot?fixture=initial&selected=${empty}`);
    assert.equal(selected.status, 200);
    assert.equal(selected.body.snapshot.selected, empty);
    assert.deepEqual(selected.body.snapshot.destinations, []);
    const unknown = await json(`${base}/api/snapshot?fixture=unknown&selected=-1`);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'UNKNOWN_FIXTURE');
  } finally { await close(server); }
});

test('malformed and duplicate queries and remote Host/Origin never invoke a child', async () => {
  let calls = 0;
  const server = createServer({ execFileImpl() { calls++; throw new Error('Must not run'); } });
  const base = await listen(server);
  try {
    for (const query of ['', '?fixture=initial', '?fixture=initial&selected=-1&selected=0', '?fixture=initial&fixture=initial&selected=-1', '?fixture=initial&selected=512', '?fixture=initial&selected=-2', '?fixture=initial&selected=1.0', '?fixture=initial&selected=00', '?fixture=initial&selected=-1&extra=1', '?fixture=..%2Fsrc&selected=0']) {
      const result = await json(`${base}/api/snapshot${query}`);
      assert.equal(result.status, 400, query);
      assert.equal(result.body.error.code, 'INVALID_REQUEST');
    }
    for (const headers of [{ Host: 'evil.example' }, { Origin: 'https://evil.example' }, { Origin: 'null' }, { Host: 'localhost.evil.example' }]) {
      const result = await rawRequest(base, '/api/snapshot?fixture=initial&selected=-1', { headers });
      assert.equal(result.status, 400, JSON.stringify(headers));
    }
    assert.equal(calls, 0);
    assert.equal((await json(`${base}/api/snapshot?fixture=initial&selected=-1`, { method: 'POST' })).status, 405);
  } finally { await close(server); }
});

for (const [mode, status, code] of [['timeout', 504, 'FABER_TIMEOUT'], ['failure', 502, 'FABER_FAILURE'], ['overflow', 502, 'FABER_FAILURE'], ['invalid', 502, 'INVALID_FABER_JSON'], ['schema', 502, 'INVALID_FABER_JSON']]) {
  test(`child ${mode} is a bounded transport error`, async () => {
    const record = {};
    const server = createServer({ execFileImpl: mockExec(mode, record), timeoutMs: mode === 'timeout' ? 50 : 2000 });
    const base = await listen(server);
    try {
      const result = await json(`${base}/api/snapshot?fixture=initial&selected=-1`);
      assert.equal(result.status, status);
      assert.equal(result.body.error.code, code);
      assert.equal(JSON.stringify(result.body).includes('private diagnostic'), false);
      assert.equal(record.file, FABER_BINARY);
      assert.deepEqual(record.args, ['run', '--locale', 'en', ROOT, '--', 'initial', '-1']);
      assert.equal(record.options.cwd, ROOT);
      assert.equal(record.options.shell, false);
      assert.equal(record.options.maxBuffer, MAX_OUTPUT);
      assert.equal(record.options.killSignal, 'SIGKILL');
      assert.notEqual(record.child.exitCode ?? record.child.signalCode, null);
    } finally { await close(server); }
  });
}

test('two children maximum; disconnect and shutdown kill children', async () => {
  const children = [];
  let launched;
  const nextLaunch = () => new Promise(resolve => { launched = resolve; });
  const execute = mockExec('hold');
  const server = createServer({ execFileImpl(...args) { const child = execute(...args); children.push(child); launched(); return child; } });
  const base = await listen(server);
  const launchOne = nextLaunch();
  const first = request(`${base}/api/snapshot?fixture=initial&selected=-1`);
  first.on('error', () => {}); first.end();
  await launchOne;
  const launchTwo = nextLaunch();
  const second = request(`${base}/api/snapshot?fixture=initial&selected=0`);
  second.on('error', () => {}); second.end();
  await launchTwo;
  try {
    const busy = await json(`${base}/api/snapshot?fixture=initial&selected=1`);
    assert.equal(busy.status, 503);
    assert.equal(busy.body.error.code, 'BUSY');
    assert.equal(children.length, 2);
    const firstExit = once(children[0], 'exit');
    first.destroy();
    const [, signal] = await firstExit;
    assert.equal(signal, 'SIGKILL');
    const secondExit = once(children[1], 'exit');
    await close(server);
    assert.equal((await secondExit)[1], 'SIGKILL');
  } finally { first.destroy(); second.destroy(); if (server.listening) await close(server); }
});

function rawRequest(base, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(`${base}/`, { ...options, path }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }); req.on('error', reject); req.end();
  });
}

test('only contained browser files and fixed local three JS assets are served', async () => {
  const server = createServer();
  const base = await listen(server);
  try {
    const slice = await rawRequest(base, '/slices.mjs');
    assert.equal(slice.status, 200);
    assert.match(slice.headers['content-type'], /javascript/);
    for (const path of ['/vendor/three/build/three.module.js', '/vendor/three/build/three.core.js', '/vendor/three/examples/jsm/controls/OrbitControls.js']) {
      assert.equal((await rawRequest(base, path)).status, 200, path);
    }
    for (const path of PIECE_IMAGE_URLS) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('content-type'), 'image/png', path);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(`${ROOT}${path}`), path);
    }
    for (const path of ['/assets/unknown.png', '/assets/white_king.PNG', '/assets/white_king.png/extra', '/assets/README.md', '/assets/', '/assets/white_king.svg', '/package.json', '/.git/config', '/.tools/faber/1.12.0/bin/faber', '/vendor/three/package.json', '/vendor/three/src/Three.js']) {
      assert.equal((await rawRequest(base, path)).status, 404, path);
    }
    for (const path of ['/assets/../README.md', '/assets/%2e%2e/README.md', '/assets/%5cwhite_king.png', '/../package.json', '/%2e%2e/package.json', '/vendor/three/build/%2e%2e/%2e%2e/package.json', '/%5c..%5cpackage.json', '/%00', '/%invalid']) {
      assert.equal((await rawRequest(base, path)).status, 400, path);
    }
  } finally { await close(server); }
});

test('startup checks pinned compiler and current source; busy requested port refuses readiness', async () => {
  const logs = [];
  const server = await startServer({ port: 0, log: text => logs.push(text) });
  try {
    assert.deepEqual(logs, [`Ready: http://127.0.0.1:${server.address().port}`]);
    const failedLogs = [];
    await assert.rejects(startServer({ port: server.address().port, log: text => failedLogs.push(text) }), { code: 'EADDRINUSE' });
    assert.deepEqual(failedLogs, []);
  } finally { await close(server); }
});

// These injected envelopes prove HTTP atomicity only; they do not implement chess.
function matchEnvelope(revision = 0, selected = -1, capsule = `ZC1|opaque-${revision}`) {
  return { ok: true, capsule, snapshot: { schemaVersion: 2, mode: 'match', revision, sideToMove: 1,
    inCheck: false, result: 'active', selected, cells: Array(512).fill(0), moved: Array(512).fill(0), destinations: [], moves: [], lastMove: null } };
}
function matchExec(handler = () => undefined) {
  const calls = [];
  const execute = (file, args, options, callback) => {
    const operand = args.at(-1); calls.push(operand);
    const child = { killed: false, kill() { this.killed = true; callback(Object.assign(new Error('killed'), { killed: true }), ''); } };
    setImmediate(() => {
      if (child.killed) return;
      const custom = handler(operand, callback, child, calls);
      if (custom === null) return;
      const parts = operand.split('~');
      const rev = parts[0] === 'init' ? 0 : parts[0] === 'read' ? Number(parts.at(-1).split('-')[1]) : Number(parts[1]) + 1;
      callback(null, JSON.stringify(custom ?? matchEnvelope(rev, parts[0] === 'read' ? Number(parts[1]) : -1)));
    });
    return child;
  };
  return { execute, calls };
}
async function matchHost(handler, options = {}) {
  const mock = matchExec(handler);
  const server = createServer({ execFileImpl: mock.execute, ...options });
  const base = await listen(server);
  return { server, base, ...mock };
}
function post(base, action, body) { return json(`${base}/api/match/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
async function readMatch(base) { return json(`${base}/api/match?selected=-1`); }

test('match: startup initializes after compiler check and fails without readiness on bad init', async () => {
  let checked = false;
  const mock = matchExec(() => { assert.equal(checked, true); });
  const logs = [];
  const server = await startServer({ port: 0, checkCompilerImpl: async () => { checked = true; }, execFileImpl: mock.execute, log: t => logs.push(t) });
  try { assert.deepEqual(mock.calls, ['init']); assert.equal(logs.length, 1); }
  finally { await close(server); }
  const bad = matchExec(() => ({ ok: true, snapshot: {} }));
  await assert.rejects(startServer({ port: 0, checkCompilerImpl: async () => {}, execFileImpl: bad.execute, log() { assert.fail('false readiness'); } }));
});

test('match: opaque read, competing mutations, stale identity and new revision are atomic', async () => {
  const h = await matchHost();
  try {
    const first = await readMatch(h.base);
    assert.equal(first.status, 200); assert.equal(Object.hasOwn(first.body, 'capsule'), false);
    const session = first.body.session;
    const body = { session, revision: 0, from: 1, to: 2, promotion: 0 };
    const results = await Promise.all([post(h.base, 'move', body), post(h.base, 'move', body)]);
    assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
    assert.equal(h.calls.filter(x => x.startsWith('move~')).length, 1);
    assert.equal((await post(h.base, 'new', { session: 'old', revision: 1 })).body.error.code, 'STALE_SESSION');
    const fresh = await post(h.base, 'new', { session, revision: 1 });
    assert.equal(fresh.body.snapshot.revision, 2);
    assert.equal((await readMatch(h.base)).body.snapshot.revision, 2);
    assert.ok(h.calls.includes('new~1~ZC1|opaque-1'));
  } finally { await close(h.server); }
});

test('match: exact request shapes, bounds, methods, size and origin reject before child', async () => {
  const h = await matchHost();
  try {
    for (const q of ['', '?selected=-2', '?selected=512', '?selected=00', '?selected=-1&selected=0', '?selected=-1&capsule=x'])
      assert.equal((await json(`${h.base}/api/match${q}`)).status, 400, q);
    assert.equal((await json(`${h.base}/api/match`, { method: 'POST' })).status, 405);
    assert.equal((await post(h.base, 'new', { session: 'x', revision: 0, capsule: 'x' })).status, 400);
    assert.equal((await post(h.base, 'move', { session: 'x', revision: 0, from: 1, to: 2, promotion: 6 })).status, 400);
    for (const [body, headers, status] of [['{', { 'Content-Type': 'application/json' }, 400], ['{}', {}, 400], [' '.repeat(1025), { 'Content-Type': 'application/json' }, 413], ['{}', { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, 400]])
      assert.equal((await json(`${h.base}/api/match/new`, { method: 'POST', headers, body })).status, status);
    assert.equal(h.calls.length, 0);
  } finally { await close(h.server); }
});

test('match: semantic failure retains capsule and recovers on next action', async () => {
  let rejected = false;
  const h = await matchHost(op => {
    if (op.startsWith('move~') && !rejected) { rejected = true; return { ok: false, error: { code: 'ILLEGAL_MOVE', message: 'Move is not legal' } }; }
  });
  try {
    const { session } = (await readMatch(h.base)).body;
    const body = { session, revision: 0, from: 1, to: 2, promotion: 0 };
    assert.equal((await post(h.base, 'move', body)).status, 422);
    assert.equal((await readMatch(h.base)).body.snapshot.revision, 0);
    assert.equal((await post(h.base, 'move', body)).body.snapshot.revision, 1);
  } finally { await close(h.server); }
});

test('match: malformed envelopes and capsules never replace retained state', async () => {
  let mutate;
  const h = await matchHost(op => { if (op.startsWith('move~')) { const result = matchEnvelope(1); mutate(result); return result; } });
  try {
    const { session } = (await readMatch(h.base)).body;
    for (const change of [v => v.capsule = 'x'.repeat(16385), v => v.capsule = 'é', v => v.capsule = 'x~x', v => v.snapshot.revision = 2,
      v => v.snapshot.cells.pop(), v => v.snapshot.moves = [{ to: 1, kind: 'move', promotions: [] }], v => v.snapshot.sideToMove = 0,
      v => v.snapshot.result = 'other', v => v.snapshot.extra = true]) {
      mutate = change;
      assert.equal((await post(h.base, 'move', { session, revision: 0, from: 1, to: 2, promotion: 0 })).status, 502);
      assert.equal((await readMatch(h.base)).body.snapshot.revision, 0);
    }
  } finally { await close(h.server); }
});

test('match: dispatch survives disconnect and later fresh read sees committed action', async () => {
  let complete, dispatched;
  const seen = new Promise(resolve => dispatched = resolve);
  const h = await matchHost((op, callback) => {
    if (op.startsWith('move~')) { complete = () => callback(null, JSON.stringify(matchEnvelope(1))); dispatched(); return null; }
  });
  try {
    const { session } = (await readMatch(h.base)).body;
    const req = request(`${h.base}/api/match/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.on('error', () => {}); req.end(JSON.stringify({ session, revision: 0, from: 1, to: 2, promotion: 0 }));
    await seen; req.destroy(); complete();
    assert.equal((await readMatch(h.base)).body.snapshot.revision, 1);
  } finally { await close(h.server); }
});

test('match: queue bounded to four and waiting entries expire without invocation', async () => {
  let complete, dispatched;
  const seen = new Promise(resolve => dispatched = resolve);
  const h = await matchHost((op, callback) => {
    if (op.startsWith('read~')) { complete = () => callback(null, JSON.stringify(matchEnvelope())); dispatched(); return null; }
  }, { queueTimeoutMs: 40 });
  try {
    const first = readMatch(h.base); await seen;
    const queued = [readMatch(h.base), readMatch(h.base), readMatch(h.base)];
    const overflow = await readMatch(h.base);
    assert.equal(overflow.status, 503);
    for (const response of await Promise.all(queued)) assert.equal(response.status, 503);
    assert.equal(h.calls.length, 2); complete(); assert.equal((await first).status, 200);
  } finally { await close(h.server); }
});

test('match: global quota shared with geometry and shutdown kills match child', async () => {
  const children = [];
  const h = await matchHost((op, callback, child) => {
    if (op === 'init') return undefined;
    children.push(child); return null;
  });
  await h.server.initializeMatch();
  const requests = [request(`${h.base}/api/snapshot?fixture=initial&selected=-1`), request(`${h.base}/api/snapshot?fixture=initial&selected=0`)];
  for (const req of requests) { req.on('error', () => {}); req.end(); }
  while (children.length < 2) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await readMatch(h.base)).status, 503);
  for (const req of requests) req.destroy();
  await close(h.server);
  assert.ok(children.every(child => child.killed));
});

for (const mode of ['timeout', 'invalid']) {
  test(`match: ${mode} failure preserves retained state and permits recovery`, async () => {
    let fail = true;
    const h = await matchHost((op, callback) => {
      if (!op.startsWith('move~') || !fail) return undefined;
      fail = false;
      if (mode === 'timeout') callback(Object.assign(new Error('timeout'), { killed: true }), '');
      else callback(null, 'invalid');
      return null;
    });
    try {
      const { session } = (await readMatch(h.base)).body;
      const body = { session, revision: 0, from: 1, to: 2, promotion: 0 };
      assert.equal((await post(h.base, 'move', body)).status, mode === 'timeout' ? 504 : 502);
      assert.equal((await post(h.base, 'move', body)).body.snapshot.revision, 1);
    } finally { await close(h.server); }
  });
}
