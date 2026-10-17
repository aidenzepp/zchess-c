export function coordinateLabel(id) {
  if (id === -1) return 'None';
  return `${String.fromCharCode(65 + id % 8)}${Math.floor(id / 8) % 8 + 1}${String.fromCharCode(83 + Math.floor(id / 64))}`;
}

export async function fetchSnapshot(identity, { signal } = {}) {
  const query = new URLSearchParams({ fixture: identity.fixture, selected: String(identity.selected) });
  const response = await fetch(`/api/snapshot?${query}`, { signal });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error(result.error ? `${result.error.code}: ${result.error.message}` : `Snapshot request failed (${response.status})`);
  if (result.snapshot.fixtureId !== identity.fixture || result.snapshot.selected !== identity.selected) throw new Error('Snapshot identity does not match the request');
  return result.snapshot;
}

export async function fetchMatch(action, payload, { signal } = {}) {
  const reading = action === 'read';
  const response = await fetch(reading ? `/api/match?selected=${payload.selected}` : `/api/match/${action}`, reading ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    const error = new Error(result.error ? `${result.error.code}: ${result.error.message}` : `Match request failed (${response.status})`);
    error.code = result.error?.code;
    throw error;
  }
  return result;
}

export function createController({ transport = fetchSnapshot, matchTransport = fetchMatch, initialMode = 'play', onChange = () => {} } = {}) {
  let generation = 0;
  let abort = null;
  let disposed = false;
  let state = {
    mode: initialMode, requested: initialMode === 'play' ? { mode: 'match', selected: -1 } : { fixture: 'initial', selected: -1 },
    session: null, mutationPending: false, promotion: null,
    snapshot: null, fixtures: [], pending: false, error: null,
    presentation: { view: 'space', plane: 'file-rank', fixedIndex: 0, pieceStyle: 'sprites' },
  };
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  async function query(identity) {
    if (disposed) return;
    const current = ++generation;
    abort?.abort();
    abort = new AbortController();
    publish({ requested: identity, snapshot: null, pending: true, error: null });
    try {
      const snapshot = await transport(identity, { signal: abort.signal });
      if (disposed || current !== generation) return;
      if (snapshot.fixtureId !== identity.fixture || snapshot.selected !== identity.selected) throw new Error('Snapshot identity does not match the request');
      publish({ snapshot, fixtures: [...snapshot.fixtures], pending: false });
    } catch (error) {
      if (disposed || current !== generation) return;
      publish({ snapshot: null, pending: false, error: error.message || String(error) });
    }
  }
  function validMatch(result, selected) {
    if (typeof result.session !== 'string' || result.snapshot?.schemaVersion !== 2 || result.snapshot.mode !== 'match' || result.snapshot.selected !== selected) throw new Error('Match identity does not match the request');
    return result;
  }
  async function readMatch(selected = -1, notice = null) {
    if (disposed) return;
    const current = ++generation;
    abort?.abort(); abort = new AbortController();
    publish({ requested: { mode: 'match', selected }, snapshot: null, pending: true, error: notice, promotion: null });
    try {
      const result = validMatch(await matchTransport('read', { selected }, { signal: abort.signal }), selected);
      if (disposed || current !== generation) return;
      publish({ snapshot: result.snapshot, session: result.session, pending: false });
    } catch (error) {
      if (disposed || current !== generation) return;
      publish({ snapshot: null, pending: false, error: error.message || String(error) });
    }
  }
  async function mutate(action, extra = {}) {
    if (disposed || state.mode !== 'play' || state.pending || state.mutationPending || !state.snapshot) return;
    const current = ++generation;
    abort?.abort();
    const payload = { session: state.session, revision: state.snapshot.revision, ...extra };
    publish({ pending: true, mutationPending: true, promotion: null, error: null });
    try {
      const result = validMatch(await matchTransport(action, payload), -1);
      if (disposed || current !== generation) return;
      publish({ snapshot: result.snapshot, session: result.session, requested: { mode: 'match', selected: -1 }, pending: false, mutationPending: false });
    } catch (error) {
      if (disposed || current !== generation) return;
      publish({ pending: false, mutationPending: false, error: error.message || String(error) });
      if (['STALE_SESSION', 'STALE_REVISION'].includes(error.code)) await readMatch(-1, `${error.message}. Match refreshed; choose your action again.`);
    }
  }
  return {
    getState: () => state,
    start: () => state.mode === 'play' ? readMatch() : query(state.requested),
    select(id) {
      if (!Number.isInteger(id) || id < -1 || id > 511) throw new RangeError('Invalid cell ID');
      if (state.mutationPending || state.promotion) return;
      if (state.mode === 'geometry') return query({ fixture: state.requested.fixture, selected: id });
      const move = state.snapshot?.moves.find(move => move.to === id);
      if (move) {
        if (move.promotions.length) {
          publish({ promotion: { from: state.snapshot.selected, to: id, choices: [...move.promotions] } });
          return;
        }
        return mutate('move', { from: state.snapshot.selected, to: id, promotion: 0 });
      }
      return readMatch(id);
    },
    promote(kind) {
      const choice = state.promotion;
      if (!choice || !choice.choices.includes(kind)) throw new RangeError('Invalid promotion choice');
      return mutate('move', { from: choice.from, to: choice.to, promotion: kind });
    },
    cancelPromotion() { publish({ promotion: null }); },
    newGame: () => mutate('new'),
    setMode(mode) {
      if (!['play', 'geometry'].includes(mode)) throw new RangeError('Invalid mode');
      if (state.mutationPending || mode === state.mode) return;
      publish({ mode, promotion: null, error: null });
      return mode === 'play' ? readMatch() : query({ fixture: 'initial', selected: -1 });
    },
    selectFixture(fixture) { if (state.mode === 'geometry') return query({ fixture, selected: -1 }); },
    setPresentation(patch) {
      const next = { ...state.presentation, ...patch };
      if (!['sprites', 'text'].includes(next.pieceStyle) || !['space', 'slices'].includes(next.view) || !['file-rank', 'file-tier', 'rank-tier'].includes(next.plane) || !Number.isInteger(next.fixedIndex) || next.fixedIndex < 0 || next.fixedIndex > 7) throw new RangeError('Invalid presentation');
      publish({ presentation: next });
    },
    dispose() { disposed = true; generation++; abort?.abort(); },
  };
}
