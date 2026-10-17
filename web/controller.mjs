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

export function createController({ transport = fetchSnapshot, onChange = () => {} } = {}) {
  let generation = 0;
  let abort = null;
  let disposed = false;
  let state = {
    requested: { fixture: 'initial', selected: -1 },
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
  return {
    getState: () => state,
    start: () => query(state.requested),
    select(id) {
      if (!Number.isInteger(id) || id < -1 || id > 511) throw new RangeError('Invalid cell ID');
      return query({ fixture: state.requested.fixture, selected: id });
    },
    selectFixture(fixture) { return query({ fixture, selected: -1 }); },
    setPresentation(patch) {
      const next = { ...state.presentation, ...patch };
      if (!['sprites', 'text'].includes(next.pieceStyle) || !['space', 'slices'].includes(next.view) || !['file-rank', 'file-tier', 'rank-tier'].includes(next.plane) || !Number.isInteger(next.fixedIndex) || next.fixedIndex < 0 || next.fixedIndex > 7) throw new RangeError('Invalid presentation');
      publish({ presentation: next });
    },
    dispose() { disposed = true; generation++; abort?.abort(); },
  };
}
