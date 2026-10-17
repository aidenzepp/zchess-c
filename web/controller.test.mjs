import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, coordinateLabel, fetchSnapshot } from './controller.mjs';

const snapshot = identity => ({ schemaVersion: 1, fixtureId: identity.fixture, fixtures: ['initial', 'rook-center'], selected: identity.selected, cells: Array(512).fill(0), moved: Array(512).fill(0), destinations: [] });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('initial query, cell selection, empty selection and fixture switch forward identities', async () => {
  const calls = [];
  const controller = createController({ transport: async identity => { calls.push(identity); return snapshot(identity); } });
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
  const controller = createController({ transport: identity => { const job = deferred(); jobs.push({ ...job, identity }); return job.promise; }, onChange: state => changes.push(state) });
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
  const controller = createController({ transport: async identity => { if (fail) throw new Error('FABER_FAILURE: unavailable'); return snapshot(identity); } });
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
  const controller = createController({ transport: async identity => {
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
  const controller = createController({ transport: (_, options) => { signal = options.signal; return job.promise; }, onChange: () => updates++ });
  const work = controller.start(); controller.dispose();
  assert.equal(signal.aborted, true);
  job.resolve(snapshot({ fixture: 'initial', selected: -1 })); await work;
  assert.equal(updates, 1);
});

test('coordinate labels and request identity validation', async () => {
  assert.equal(coordinateLabel(0), 'A1S'); assert.equal(coordinateLabel(511), 'H8Z'); assert.equal(coordinateLabel(4), 'E1S');
  const controller = createController({ transport: async identity => ({ ...snapshot(identity), selected: 3 }) });
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
