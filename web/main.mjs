import { createView as createSlices } from './slices.mjs';
import { createView as createSpace } from './space.mjs';
import { createController, coordinateLabel } from './controller.mjs';

const element = id => document.getElementById(id);
const fixture = element('fixture');
const slice = element('slice');
let controller;
const views = {};
const select = id => controller.select(id);
try { views.space = createSpace(element('space'), select); }
catch (error) { element('space').textContent = `3D initialization failed: ${error.message}`; }
try { views.slices = createSlices(element('slices'), select); }
catch (error) { element('slices').textContent = `2D initialization failed: ${error.message}`; }
let catalog = '';
let slicePlane = '';
function update(state) {
  const { snapshot, pending, error, presentation } = state;
  const nextCatalog = JSON.stringify(state.fixtures);
  if (catalog !== nextCatalog) {
    catalog = nextCatalog;
    if (state.fixtures.length) fixture.replaceChildren(...state.fixtures.map(id => new Option(id, id)));
  }
  element('mode').value = state.mode;
  element('mode').disabled = state.mutationPending;
  element('fixture-control').hidden = state.mode !== 'geometry';
  fixture.disabled = state.mode !== 'geometry' || state.fixtures.length === 0;
  element('new-game').hidden = state.mode !== 'play';
  element('new-game').disabled = pending || !snapshot;
  element('clear').disabled = state.mutationPending || Boolean(state.promotion);
  if (state.mode === 'geometry' && state.fixtures.length) fixture.value = state.requested.fixture;
  element('view').value = presentation.view;
  element('piece-style').value = presentation.pieceStyle;
  element('plane').value = presentation.plane;
  element('slice-controls').hidden = presentation.view !== 'slices';
  element('reset').disabled = presentation.view !== 'space';
  if (slicePlane !== presentation.plane) {
    slicePlane = presentation.plane;
    const axis = { 'file-rank': 'Tier', 'file-tier': 'Rank', 'rank-tier': 'File' }[slicePlane];
    element('slice-label').textContent = axis;
    slice.replaceChildren(...Array.from({ length: 8 }, (_, index) => new Option(`${index} · ${axis === 'Tier' ? String.fromCharCode(83 + index) : axis === 'File' ? String.fromCharCode(65 + index) : index + 1}`, index)));
  }
  slice.value = String(presentation.fixedIndex);
  element('arena').setAttribute('aria-busy', String(pending));
  const status = element('request-status');
  const identity = state.mode === 'play' ? 'shared match' : state.requested.fixture;
  status.textContent = error ? error : pending ? `${state.mutationPending ? 'Applying action' : 'Loading'} ${identity}…` : `${identity} · current snapshot`;
  const match = snapshot?.mode === 'match' ? snapshot : null;
  const side = match?.sideToMove === 1 ? 'White' : 'Black';
  element('match-status').hidden = state.mode !== 'play';
  element('turn').textContent = match ? match.result === 'active' ? `${side} to move${match.inCheck ? ' · Check' : ''}` : ({ 'white-wins': 'White wins by checkmate', 'black-wins': 'Black wins by checkmate', stalemate: 'Draw by stalemate' }[match.result]) : 'Match unavailable';
  element('last-move').textContent = match?.lastMove ? `${coordinateLabel(match.lastMove.from)} → ${coordinateLabel(match.lastMove.to)}${match.lastMove.promotion ? ` = ${{ 2: 'Queen', 3: 'Rook', 4: 'Bishop', 5: 'Knight' }[match.lastMove.promotion]}` : ''}` : 'No moves yet';
  element('promotion').hidden = !state.promotion;
  if (state.promotion) {
    element('promotion-choices').replaceChildren(...state.promotion.choices.map(kind => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = { 2: 'Queen', 3: 'Rook', 4: 'Bishop', 5: 'Knight' }[kind];
      button.addEventListener('click', () => controller.promote(kind));
      return button;
    }));
  }

  status.classList.toggle('error', Boolean(error));
  element('selected').textContent = snapshot ? `${coordinateLabel(snapshot.selected)}${snapshot.selected === -1 ? '' : ` · ID ${snapshot.selected}`}` : pending ? 'Pending' : 'Unavailable';
  element('count').textContent = snapshot ? String(snapshot.destinations.length) : '—';
  element('targets').textContent = snapshot ? snapshot.destinations.length ? snapshot.destinations.map(id => `${coordinateLabel(id)} (${id})`).join(' · ') : 'No destinations for this selection.' : 'No current snapshot.';
  for (const name of ['space', 'slices']) {
    element(name).hidden = presentation.view !== name;
    views[name]?.render(snapshot, presentation);
  }
}
controller = createController({ onChange: update });
element('mode').addEventListener('change', event => controller.setMode(event.target.value));
element('new-game').addEventListener('click', () => controller.newGame());
element('promotion-cancel').addEventListener('click', () => controller.cancelPromotion());
fixture.addEventListener('change', () => controller.selectFixture(fixture.value));
element('view').addEventListener('change', event => controller.setPresentation({ view: event.target.value }));
element('piece-style').addEventListener('change', event => controller.setPresentation({ pieceStyle: event.target.value }));
element('plane').addEventListener('change', event => controller.setPresentation({ plane: event.target.value }));
slice.addEventListener('change', () => controller.setPresentation({ fixedIndex: Number(slice.value) }));
element('reset').addEventListener('click', () => views.space?.resetCamera());
element('clear').addEventListener('click', () => controller.select(-1));
window.addEventListener('pagehide', () => { controller.dispose(); Object.values(views).forEach(view => view.dispose()); }, { once: true });
controller.start();
