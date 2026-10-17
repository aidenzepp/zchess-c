import test from 'node:test';
import assert from 'node:assert/strict';
import { cellAt, projectCell, projectSnapshot, layoutForSize, pickCell, planeDefinition, axisLabel } from './slices.mjs';

test('slice axes and fixed-axis labels use agreed coordinate labels', () => {
  const expected = { file: ['A', 'H'], rank: ['1', '8'], tier: ['S', 'Z'] };
  for (const plane of ['file-rank', 'file-tier', 'rank-tier']) {
    const { horizontal, vertical, fixed } = planeDefinition(plane);
    for (const axis of [horizontal, vertical, fixed]) {
      assert.deepEqual([axisLabel(axis, 0), axisLabel(axis, 7)], expected[axis]);
    }
  }
});

for (const plane of ['file-rank', 'file-tier', 'rank-tier']) {
  for (const fixedIndex of [0, 7]) {
    test(`${plane} slice ${fixedIndex}: all 64 cells project and pick bijectively`, () => {
      const layout = layoutForSize(641, 493);
      const seen = new Set();
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
          const id = cellAt(column, row, plane, fixedIndex);
          seen.add(id);
          assert.deepEqual(projectCell(id, plane, fixedIndex), { column, row });
          assert.equal(pickCell(layout.left + (column + 0.5) * layout.step, layout.top + (7.5 - row) * layout.step, layout, plane, fixedIndex), id);
        }
      }
      assert.equal(seen.size, 64);
    });
  }
}

test('axis anchors agree with file + 8*rank + 64*tier contract', () => {
  assert.equal(cellAt(2, 3, 'file-rank', 5), 346);
  assert.equal(cellAt(2, 5, 'file-tier', 3), 346);
  assert.equal(cellAt(3, 5, 'rank-tier', 2), 346);
  assert.deepEqual(planeDefinition('rank-tier').axes, [1, 2, 0]);
});

test('supplied selection and targets project without inventing candidates', () => {
  const snapshot = { cells: Array(512).fill(0), selected: 346, destinations: [0, 346, 511] };
  snapshot.cells[346] = -5;
  for (const [plane, fixedIndex] of [['file-rank', 5], ['file-tier', 3], ['rank-tier', 2]]) {
    const view = projectSnapshot(snapshot, plane, fixedIndex);
    assert.equal(view.selectionOffSlice, false);
    assert.deepEqual(view.cells.filter(cell => cell.selected).map(cell => [cell.id, cell.piece]), [[346, -5]]);
    assert.deepEqual(view.cells.filter(cell => cell.target).map(cell => cell.id), [346]);
    assert.equal(projectSnapshot(snapshot, plane, 0).selectionOffSlice, true);
  }
  assert.equal(projectSnapshot({ ...snapshot, selected: -1 }).selectionOffSlice, false);
  assert.deepEqual(snapshot.destinations, [0, 346, 511]);
});

test('picking excludes labels and outer edges, uses CSS pixel coordinates', () => {
  const layout = layoutForSize(480, 640);
  assert.equal(pickCell(layout.left, layout.top, layout), 56);
  assert.equal(pickCell(layout.left + layout.size - 0.01, layout.top + layout.size - 0.01, layout), 7);
  for (const [x, y] of [[layout.left - 1, layout.top], [layout.left, layout.top - 1], [layout.left + layout.size, layout.top], [layout.left, layout.top + layout.size]]) {
    assert.equal(pickCell(x, y, layout), null);
  }
  assert.equal(pickCell(0, 0, layoutForSize(20, 20)), null);
});

test('invalid planes, indices and IDs are rejected', () => {
  assert.throws(() => cellAt(0, 0, 'other', 0), RangeError);
  assert.throws(() => cellAt(8, 0), RangeError);
  assert.throws(() => cellAt(0, 0, 'file-rank', -1), RangeError);
  assert.throws(() => projectCell(512), RangeError);
});
