import test from 'node:test';
import assert from 'node:assert/strict';
import {cellPosition, pickCell, cameraIntent, trackPointer, isPickGesture, createView} from './space.mjs';

test('all 512 cell IDs map bijectively to file X, tier Y, rank Z', () => {
  const positions = new Set();
  for (let tier = 0; tier < 8; tier++) for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
    const id = file + 8 * rank + 64 * tier;
    const position = cellPosition(id);
    assert.deepEqual(position, [file - 3.5, tier - 3.5, rank - 3.5]);
    positions.add(position.join(','));
  }
  assert.equal(positions.size, 512);
  assert.deepEqual(cellPosition(0), [-3.5, -3.5, -3.5]);
  assert.deepEqual(cellPosition(511), [3.5, 3.5, 3.5]);
});

test('piece and empty-dot hits retain exact snapshot identity', () => {
  for (let id = 0; id < 512; id++) {
    assert.equal(pickCell({object: {userData: {cellId: id}}, index: 3}), id);
    assert.equal(pickCell({object: {userData: {arenaDots: true}}, index: id}), id);
  }
  for (const hit of [null, {}, {object: {userData: {}}}, {object: {userData: {cellId: -1}}},
    {object: {userData: {arenaDots: true}}, index: 512}, {object: {userData: {cellId: 1.5}}}]) assert.equal(pickCell(hit), null);
});

test('focused canvas keyboard mappings express camera-only intent', () => {
  const expected = {
    ArrowLeft: ['orbit', -1, 0], ArrowRight: ['orbit', 1, 0], ArrowUp: ['orbit', 0, -1], ArrowDown: ['orbit', 0, 1],
    w: ['pan', 0, 1], a: ['pan', -1, 0], s: ['pan', 0, -1], d: ['pan', 1, 0],
    '+': ['zoom', -1], '=': ['zoom', -1], '-': ['zoom', 1], r: ['reset'],
  };
  for (const [key, intent] of Object.entries(expected)) assert.deepEqual(cameraIntent({key}), intent);
  assert.deepEqual(cameraIntent({key: 'W'}), expected.w);
  assert.deepEqual(cameraIntent({key: 'R'}), expected.r);
  assert.equal(cameraIntent({key: 'Escape'}), null);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) assert.equal(cameraIntent({key: 'r', target: {tagName}}), null);
  assert.equal(cameraIntent({key: 'w', target: {isContentEditable: true}}), null);
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(cameraIntent({key: 'r', [modifier]: true}), null);
});

test('only a primary click picks; any drag stays suppressed after returning', () => {
  const start = {id: 7, x: 10, y: 20, button: 0, dragged: false};
  const event = {pointerId: 7, clientX: 10, clientY: 20};
  assert.equal(isPickGesture(start, event), true);
  assert.equal(isPickGesture(start, {...event, clientX: 13, clientY: 24}), true);
  assert.equal(isPickGesture(start, {...event, clientX: 16}), false);
  const dragged = trackPointer(start, {...event, clientX: 30});
  assert.equal(isPickGesture(dragged, event), false);
  assert.equal(isPickGesture({...start, button: 2}, event), false);
  assert.equal(isPickGesture(start, {...event, pointerId: 9}), false);
  assert.equal(isPickGesture(null, event), false);
});

test('public renderer entry is available without importing a DOM or GPU', () => {
  assert.equal(typeof createView, 'function');
});
