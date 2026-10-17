import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, coordinateLabel, fetchSnapshot } from './controller.mjs';

const snapshot = identity => ({ schemaVersion: 1, fixtureId: identity.fixture, fixtures: ['initial', 'rook-center'], selected: identity.selected, cells: Array(512).fill(0), moved: Array(512).fill(0), destinations: [] });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('initial query, cell selection, empty selection and fixture switch forward identities', async () => {
  const calls = [];
  const controller = createController({ initialMode: 'geometry', transport: async identity => { calls.push(identity); return snapshot(identity); } });
  await controller.start();
  await controller.select(227);
  await controller.select(-1);
  await controller.selectFixture('rook-center');
  assert.deepEqual(calls, [{ fixture: 'initial', selected: -1 }, { fixture: 'initial', selected: 227 }, { fixture: 'initial', selected: -1 }, { fixture: 'rook-center', selected: -1 }]);
  assert.equal(controller.getState().snapshot.selected, -1);
  assert.deepEqual(controller.getState().fixtures, ['initial', 'rook-center']);
});

test('loading clears previous snapshot; late success and late error cannot restore stale selection', async () => {
  const jobs = [];
  const changes = [];
  const controller = createController({ initialMode: 'geometry', transport: identity => { const job = deferred(); jobs.push({ ...job, identity }); return job.promise; }, onChange: state => changes.push(state) });
  const first = controller.start();
  jobs[0].resolve(snapshot(jobs[0].identity)); await first;
  const old = controller.select(0);
  assert.equal(controller.getState().snapshot, null);
  assert.equal(controller.getState().pending, true);
  const current = controller.selectFixture('rook-center');
  jobs[2].resolve(snapshot(jobs[2].identity)); await current;
  jobs[1].resolve({ ...snapshot(jobs[1].identity), destinations: [1] }); await old;
  assert.equal(controller.getState().snapshot.fixtureId, 'rook-center');
  const older = controller.select(1);
  const newer = controller.select(2);
  jobs[4].resolve(snapshot(jobs[4].identity)); await newer;
  jobs[3].reject(new Error('old error')); await older;
  assert.equal(controller.getState().snapshot.selected, 2);
  assert.equal(controller.getState().error, null);
  assert.ok(changes.length >= 6);
});

test('current failure remains visible without old highlights and can recover', async () => {
  let fail = false;
  const controller = createController({ initialMode: 'geometry', transport: async identity => { if (fail) throw new Error('FABER_FAILURE: unavailable'); return snapshot(identity); } });
  await controller.start(); fail = true; await controller.select(5);
  assert.equal(controller.getState().snapshot, null);
  assert.equal(controller.getState().pending, false);
  assert.equal(controller.getState().error, 'FABER_FAILURE: unavailable');
  assert.equal(controller.getState().fixtures.length, 2);
  fail = false; await controller.select(-1);
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().snapshot.selected, -1);
});

test('presentation defaults to sprites; valid style changes preserve snapshot and never query', async () => {
  let calls = 0;
  const controller = createController({ initialMode: 'geometry', transport: async identity => {
    calls++;
    const result = snapshot(identity);
    if (identity.selected === 227) { result.cells[227] = 3; result.destinations = [228, 235]; }
    return result;
  } });
  assert.equal(controller.getState().presentation.pieceStyle, 'sprites');
  await controller.start();
  await controller.select(227);
  const before = controller.getState().snapshot;
  const requested = controller.getState().requested;
  const targets = before.destinations;
  const contents = JSON.stringify(before);
  controller.setPresentation({ view: 'slices', plane: 'rank-tier', fixedIndex: 7 });
  for (const pieceStyle of ['text', 'sprites', 'text', 'sprites']) {
    controller.setPresentation({ pieceStyle });
    assert.deepEqual(controller.getState().presentation, { view: 'slices', plane: 'rank-tier', fixedIndex: 7, pieceStyle });
    assert.equal(controller.getState().snapshot, before);
    assert.equal(controller.getState().snapshot.destinations, targets);
    assert.equal(controller.getState().requested, requested);
  }
  const state = controller.getState();
  for (const pieceStyle of ['png', '', null, undefined, 0]) {
    assert.throws(() => controller.setPresentation({ pieceStyle }), RangeError);
    assert.equal(controller.getState(), state);
  }
  controller.setPresentation({ view: 'space' });
  assert.equal(controller.getState().presentation.pieceStyle, 'sprites');
  assert.equal(calls, 2);
  assert.equal(controller.getState().snapshot, before);
  assert.equal(JSON.stringify(before), contents);
  assert.deepEqual(controller.getState().requested, { fixture: 'initial', selected: 227 });
});

test('disposal aborts and ignores pending responses', async () => {
  const job = deferred(); let signal; let updates = 0;
  const controller = createController({ initialMode: 'geometry', transport: (_, options) => { signal = options.signal; return job.promise; }, onChange: () => updates++ });
  const work = controller.start(); controller.dispose();
  assert.equal(signal.aborted, true);
  job.resolve(snapshot({ fixture: 'initial', selected: -1 })); await work;
  assert.equal(updates, 1);
});

test('coordinate labels and request identity validation', async () => {
  assert.equal(coordinateLabel(0), 'A1S'); assert.equal(coordinateLabel(511), 'H8Z'); assert.equal(coordinateLabel(4), 'E1S');
  const controller = createController({ initialMode: 'geometry', transport: async identity => ({ ...snapshot(identity), selected: 3 }) });
  await controller.start();
  assert.match(controller.getState().error, /identity/);
  assert.equal(controller.getState().snapshot, null);
  assert.throws(() => controller.select(512), RangeError);
  assert.throws(() => controller.setPresentation({ fixedIndex: 8 }), RangeError);
});

test('HTTP transport forwards the query and surfaces semantic errors', async () => {
  const original = globalThis.fetch;
  const identity = { fixture: 'initial', selected: -1 };
  let called;
  try {
    globalThis.fetch = async (url, options) => { called = { url, options }; return { ok: true, json: async () => ({ ok: true, snapshot: snapshot(identity) }) }; };
    const signal = new AbortController().signal;
    assert.equal((await fetchSnapshot(identity, { signal })).selected, -1);
    assert.equal(called.url, '/api/snapshot?fixture=initial&selected=-1');
    assert.equal(called.options.signal, signal);
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: { code: 'UNKNOWN_FIXTURE', message: 'Unknown fixture' } }) });
    await assert.rejects(fetchSnapshot(identity), /UNKNOWN_FIXTURE/);
  } finally { globalThis.fetch = original; }
});

// Explicit read-model fixtures; no browser-side chess calculations.
function matchSnapshot(selected = -1, patch = {}) {
  const cells = Array(512).fill(0); cells[4] = 1; cells[508] = -1; cells[72] = 6;
  return { schemaVersion: 2, mode: 'match', revision: 0, sideToMove: 1, inCheck: false, result: 'active', selected, cells, moved: Array(512).fill(0), destinations: selected === 72 ? [80] : [], moves: selected === 72 ? [{ to: 80, kind: 'move', promotions: [] }] : [], lastMove: null, ...patch };
}
const matchEnvelope = (selected = -1, patch = {}) => ({ ok: true, session: 'test-session', snapshot: matchSnapshot(selected, patch) });

test('play defaults to read, selects via Faber, applies supplied move with no optimistic state', async () => {
  const calls = []; const job = deferred();
  const controller = createController({ matchTransport: async (action, payload) => {
    calls.push({ action, payload });
    return action === 'read' ? matchEnvelope(payload.selected) : job.promise;
  } });
  await controller.start(); await controller.select(72);
  const before = controller.getState().snapshot;
  const moving = controller.select(80);
  assert.equal(controller.getState().snapshot, before);
  assert.equal(controller.getState().mutationPending, true);
  await controller.select(80); await controller.newGame(); await controller.setMode('geometry');
  assert.equal(calls.length, 3);
  controller.setPresentation({ view: 'slices', pieceStyle: 'text', plane: 'rank-tier', fixedIndex: 3 });
  job.resolve(matchEnvelope(-1, { revision: 1, sideToMove: -1, lastMove: { from: 72, to: 80, promotion: 0 } })); await moving;
  assert.deepEqual(calls[2], { action: 'move', payload: { session: 'test-session', revision: 0, from: 72, to: 80, promotion: 0 } });
  assert.equal(controller.getState().snapshot.revision, 1);
  assert.equal(controller.getState().mutationPending, false);
  assert.equal(controller.getState().presentation.pieceStyle, 'text');
});

test('promotion uses descriptor choices, cancel leaves match unchanged, choice is atomic', async () => {
  const calls = [];
  const promotion = { destinations: [511], moves: [{ to: 511, kind: 'capture', promotions: [2, 3, 4, 5] }] };
  const controller = createController({ matchTransport: async (action, payload) => { calls.push({ action, payload }); return action === 'read' ? matchEnvelope(payload.selected, payload.selected === 503 ? promotion : {}) : matchEnvelope(-1, { revision: 1 }); } });
  await controller.start(); await controller.select(503);
  const before = controller.getState().snapshot;
  await controller.select(511);
  assert.deepEqual(controller.getState().promotion, { from: 503, to: 511, choices: [2, 3, 4, 5] });
  assert.throws(() => controller.promote(1), RangeError);
  await controller.select(0);
  controller.cancelPromotion();
  assert.equal(controller.getState().snapshot, before); assert.equal(calls.length, 2);
  await controller.select(511); await controller.promote(5);
  assert.deepEqual(calls[2].payload, { session: 'test-session', revision: 0, from: 503, to: 511, promotion: 5 });
});

test('stale action refreshes without replay; other rejection preserves prior state', async () => {
  const calls = []; let failure = 'STALE_REVISION';
  const controller = createController({ matchTransport: async (action, payload) => {
    calls.push(action);
    if (action !== 'read') { const error = new Error(failure); error.code = failure; throw error; }
    return matchEnvelope(payload.selected);
  } });
  await controller.start(); await controller.select(72); await controller.select(80);
  assert.deepEqual(calls, ['read', 'read', 'move', 'read']);
  assert.match(controller.getState().error, /choose your action again/);
  assert.equal(controller.getState().snapshot.selected, -1);
  failure = 'ILLEGAL_MOVE'; await controller.select(72);
  const before = controller.getState().snapshot; await controller.select(80);
  assert.equal(controller.getState().snapshot, before);
  assert.equal(controller.getState().error, 'ILLEGAL_MOVE');
});

test('mode changes invalidate old reads; geometry and presentation never mutate match; returning reads existing game', async () => {
  const jobs = []; const actions = [];
  const controller = createController({ transport: async identity => snapshot(identity), matchTransport: (action, payload) => { actions.push(action); const job = deferred(); jobs.push(job); return job.promise; } });
  const old = controller.start(); await controller.setMode('geometry');
  jobs[0].resolve(matchEnvelope()); await old;
  assert.equal(controller.getState().mode, 'geometry'); assert.equal(controller.getState().snapshot.fixtureId, 'initial');
  await controller.selectFixture('rook-center'); await controller.select(12);
  controller.setPresentation({ view: 'slices', fixedIndex: 7 });
  assert.deepEqual(actions, ['read']);
  const back = controller.setMode('play'); jobs[1].resolve(matchEnvelope(-1, { revision: 9 })); await back;
  assert.equal(controller.getState().snapshot.revision, 9);
  assert.deepEqual(actions, ['read', 'read']);
  assert.equal(controller.getState().presentation.fixedIndex, 7);
});

test('late selection read cannot overwrite newer state; terminal status permits explicit new game', async () => {
  const jobs = []; const controller = createController({ matchTransport: (action, payload) => { const job = deferred(); jobs.push({ ...job, action, payload }); return job.promise; } });
  const initial = controller.start(); jobs[0].resolve(matchEnvelope()); await initial;
  const old = controller.select(72); const current = controller.select(508);
  jobs[2].resolve(matchEnvelope(508, { result: 'white-wins', sideToMove: -1, inCheck: true })); await current;
  jobs[1].resolve(matchEnvelope(72)); await old;
  assert.equal(controller.getState().snapshot.result, 'white-wins');
  const reset = controller.newGame(); assert.equal(jobs[3].action, 'new');
  assert.deepEqual(jobs[3].payload, { session: 'test-session', revision: 0 });
  jobs[3].resolve(matchEnvelope(-1, { revision: 1 })); await reset;
  assert.equal(controller.getState().snapshot.result, 'active');
});

test('match transport uses exact routes/body, carries error code and validates read identity', async () => {
  const { fetchMatch } = await import('./controller.mjs');
  const original = globalThis.fetch; const calls = [];
  try {
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => matchEnvelope() }; };
    await fetchMatch('read', { selected: -1 });
    const payload = { session: 's', revision: 0, from: 72, to: 80, promotion: 0 };
    await fetchMatch('move', payload);
    assert.equal(calls[0].url, '/api/match?selected=-1');
    assert.equal(calls[1].url, '/api/match/move'); assert.deepEqual(JSON.parse(calls[1].options.body), payload);
    assert.equal(calls[1].options.method, 'POST');
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: { code: 'STALE_SESSION', message: 'Session changed' } }) });
    await assert.rejects(fetchMatch('new', { session: 's', revision: 0 }), error => error.code === 'STALE_SESSION');
    const controller = createController({ matchTransport: async () => matchEnvelope(3) }); await controller.start();
    assert.match(controller.getState().error, /identity/); assert.equal(controller.getState().snapshot, null);
  } finally { globalThis.fetch = original; }
});
