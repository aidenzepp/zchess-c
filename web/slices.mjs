const PLANES = Object.freeze({
  'file-rank': { horizontal: 'file', vertical: 'rank', fixed: 'tier', axes: [0, 1, 2] },
  'file-tier': { horizontal: 'file', vertical: 'tier', fixed: 'rank', axes: [0, 2, 1] },
  'rank-tier': { horizontal: 'rank', vertical: 'tier', fixed: 'file', axes: [1, 2, 0] },
});
const PIECES = ['', 'K', 'Q', 'R', 'B', 'N', 'P'];

export function planeDefinition(plane = 'file-rank') {
  if (!Object.hasOwn(PLANES, plane)) throw new RangeError('Unknown slice plane');
  return PLANES[plane];
}

function checkIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value > 7) throw new RangeError('Slice index must be 0–7');
}

function coordinates(id) {
  if (!Number.isInteger(id) || id < 0 || id > 511) throw new RangeError('Cell ID must be 0–511');
  return [id % 8, Math.floor(id / 8) % 8, Math.floor(id / 64)];
}

export function cellAt(column, row, plane = 'file-rank', fixedIndex = 0) {
  checkIndex(column);
  checkIndex(row);
  checkIndex(fixedIndex);
  const { axes } = planeDefinition(plane);
  const xyz = [];
  xyz[axes[0]] = column;
  xyz[axes[1]] = row;
  xyz[axes[2]] = fixedIndex;
  return xyz[0] + 8 * xyz[1] + 64 * xyz[2];
}

export function projectCell(id, plane = 'file-rank', fixedIndex = 0) {
  checkIndex(fixedIndex);
  const { axes } = planeDefinition(plane);
  const xyz = coordinates(id);
  return xyz[axes[2]] === fixedIndex ? { column: xyz[axes[0]], row: xyz[axes[1]] } : null;
}

export function projectSnapshot(snapshot, plane = 'file-rank', fixedIndex = 0) {
  const cells = [];
  const targets = new Set(snapshot.destinations);
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const id = cellAt(column, row, plane, fixedIndex);
      cells.push({ id, column, row, piece: snapshot.cells[id], selected: snapshot.selected === id, target: targets.has(id) });
    }
  }
  return { cells, selectionOffSlice: snapshot.selected !== -1 && projectCell(snapshot.selected, plane, fixedIndex) === null };
}

export function layoutForSize(width, height) {
  const size = Math.max(0, Math.min(width - 80, height - 80));
  return { left: (width - size) / 2, top: (height - size) / 2, size, step: size / 8 };
}

// Pointer coordinates and layout are both in CSS pixels, independent of DPR.
export function pickCell(x, y, layout, plane = 'file-rank', fixedIndex = 0) {
  if (layout.step <= 0 || x < layout.left || y < layout.top || x >= layout.left + layout.size || y >= layout.top + layout.size) return null;
  return cellAt(Math.floor((x - layout.left) / layout.step), 7 - Math.floor((y - layout.top) / layout.step), plane, fixedIndex);
}

function axisLabel(axis, index) {
  return axis === 'file' ? String.fromCharCode(65 + index) : String(index + 1);
}

export function createView(container, onSelect) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:320px';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;flex:1;min-height:260px;touch-action:manipulation';
  canvas.setAttribute('aria-label', 'Arena slice. Click a cell to inspect its supplied movement preview.');
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.cssText = 'font:14px system-ui;padding:8px;color:inherit';
  root.append(canvas, status);
  container.append(root);
  const ctx = canvas.getContext('2d');
  if (!ctx) { root.remove(); throw new Error('Canvas2D is unavailable'); }
  let snapshot = null;
  let presentation = { plane: 'file-rank', fixedIndex: 0 };
  let layout = layoutForSize(0, 0);
  let disposed = false;

  function draw() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    layout = layoutForSize(width, height);
    const { plane, fixedIndex } = presentation;
    const definition = planeDefinition(plane);
    const { left, top, step, size } = layout;
    if (!snapshot) { status.textContent = 'No current snapshot'; return; }
    const projected = projectSnapshot(snapshot, plane, fixedIndex);
    status.textContent = `${definition.fixed} ${axisLabel(definition.fixed, fixedIndex)} · ${snapshot.selected === -1 ? 'No selection' : `Selected cell ${snapshot.selected}${projected.selectionOffSlice ? ' is outside this slice' : ''}`} · ${projected.cells.filter(cell => cell.target).length} visible targets of ${snapshot.destinations.length}`;
    if (!size) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cell of projected.cells) {
      const x = left + cell.column * step;
      const y = top + (7 - cell.row) * step;
      ctx.fillStyle = (cell.column + cell.row) % 2 ? '#d7dedb' : '#edf1ee';
      ctx.fillRect(x, y, step, step);
      if (cell.target) {
        ctx.fillStyle = '#a9dcb3';
        ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        ctx.strokeStyle = '#23753c';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, step - 8, step - 8);
      }
      if (cell.piece) {
        const radius = step * 0.29;
        ctx.beginPath();
        ctx.arc(x + step / 2, y + step / 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = cell.piece > 0 ? '#fff' : '#24332e';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#24332e';
        ctx.stroke();
        ctx.fillStyle = cell.piece > 0 ? '#14251b' : '#fff';
        ctx.font = `600 ${Math.max(10, step * 0.36)}px system-ui`;
        ctx.fillText(PIECES[Math.abs(cell.piece)], x + step / 2, y + step / 2);
      }
      if (cell.selected) {
        ctx.strokeStyle = '#be4e00';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, step - 4, step - 4);
      }
    }
    ctx.fillStyle = '#61766b';
    ctx.font = '12px system-ui';
    for (let index = 0; index < 8; index++) {
      ctx.fillText(axisLabel(definition.horizontal, index), left + (index + 0.5) * step, top + size + 14);
      ctx.fillText(axisLabel(definition.vertical, index), left - 16, top + (7.5 - index) * step);
    }
    ctx.fillText(definition.horizontal, left + size / 2, top + size + 31);
    ctx.save();
    ctx.translate(left - 32, top + size / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(definition.vertical, 0, 0);
    ctx.restore();
  }

  function select(event) {
    if (!snapshot || disposed) return;
    const rect = canvas.getBoundingClientRect();
    const id = pickCell(event.clientX - rect.left, event.clientY - rect.top, layout, presentation.plane, presentation.fixedIndex);
    if (id !== null) onSelect(id);
  }
  canvas.addEventListener('click', select);
  const observer = window.ResizeObserver ? new window.ResizeObserver(draw) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', draw);
  draw();
  return {
    render(nextSnapshot, nextPresentation = {}) {
      const plane = nextPresentation.plane ?? 'file-rank';
      const fixedIndex = nextPresentation.fixedIndex ?? 0;
      planeDefinition(plane);
      checkIndex(fixedIndex);
      snapshot = nextSnapshot;
      presentation = { plane, fixedIndex };
      draw();
    },
    resetCamera() {},
    dispose() {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', draw);
      canvas.removeEventListener('click', select);
      root.remove();
    },
  };
}
