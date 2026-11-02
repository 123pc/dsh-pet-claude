/**
 * 自主时间表测试：时钟触发、有序活动、错过不补播、工作抢占和固定模式。
 * @module dsh-pet/src/shared/ambient.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AmbientDirector } from './ambient.ts';
import type { Animations } from './types.ts';

const base: Animations = {
  idle: ['idle'],
  turn: [],
  drag: [],
  clicks: [],
  moves: { default: {}, actions: [{ name: 'walk' }] },
  categories: [
    { id: 'play', weight: 1, actions: ['A', 'B'] },
    { id: 'text', weight: 1, noMirror: true, actions: ['text'] },
  ],
  events: { balance: ['event'] },
  ambient: {
    windowSec: 180,
    minEpisodes: 1,
    maxEpisodes: 1,
    minGapSec: 25,
    edgeSec: 12,
    chainChance: 1,
    chains: [{ id: 'nap', label: '犯困小憩', weight: 1, steps: [{ name: 'A' }, { name: 'B', repeats: 2 }] }],
  },
};
const context = { current: 'idle', blocked: false, fixed: false, facing: 'left' };
function director(a = base) {
  return new AmbientDirector(a, 0, () => 0.05);
}

test('a work greeting can be selected manually but is excluded from random standalone actions', () => {
  const a: Animations = {
    ...base,
    categories: [{ id: 'greeting', weight: 1, actions: ['salute', 'dance'] }],
    moves: { default: {}, actions: [] },
    workSequence: { enter: 'salute', loops: ['A'], exit: 'idle', introOnly: true },
    ambient: { ...base.ambient!, chainChance: 0, chains: [] },
  };
  const d = director(a);
  assert.equal(d.tick(d.snapshot().due[0], context)?.name, 'dance');
});

test('activity starts at a clock time between idle boundaries, then returns to idle without another burst', () => {
  const d = director(),
    at = d.snapshot().due[0];
  assert.ok(at > 12000 && at < 168000);
  assert.notEqual(at % 16000, 0);
  assert.equal(d.tick(at - 1, context), null);
  assert.equal(d.tick(at, context)?.name, 'A');
  assert.equal(d.ended('A', at + 2500, false)?.name, 'B');
  assert.equal(d.ended('B', at + 5000, false)?.name, 'B');
  assert.deepEqual(d.ended('B', at + 7500, false), { name: 'idle', rest: true, label: '安静待机' });
  assert.equal(d.tick(at + 8000, context), null);
  assert.equal(d.running, false);
});

test('missed events during work, dragging, lock or inactivity never accumulate for later playback', () => {
  const d = director(),
    at = d.snapshot().due[0];
  assert.equal(d.tick(at, { ...context, blocked: true }), null);
  assert.equal(d.tick(at + 1000, context), null);
  assert.equal(d.tick(180000, context), null);
  assert.equal(d.tick(180000 + at + 5000, context), null);
  assert.equal(d.tick(180000 + at + 5100, context), null);
});

test('interruption discards the rest of a chain, including manual replay of the same named action', () => {
  const d = director(),
    at = d.snapshot().due[0];
  d.tick(at, context);
  d.cancel(at + 100);
  assert.equal(d.ended('A', at + 200, false), null);
  assert.equal(d.running, false);
  const e = director();
  e.tick(at, context);
  assert.equal(e.ended('manual', at + 300, false), null);
  assert.equal(e.running, false);
});

test('fixed and mirrored contexts cannot schedule forbidden movement or lettering chains', () => {
  const a: Animations = {
    ...base,
    ambient: {
      ...base.ambient!,
      chains: [
        { id: 'move', label: 'walk', weight: 1, steps: [{ name: 'walk' }] },
        { id: 'words', label: 'text', weight: 1, steps: [{ name: 'text' }] },
        { id: 'ok', label: 'A', weight: 1, steps: [{ name: 'A' }] },
      ],
    },
  };
  const d = director(a);
  assert.equal(d.tick(d.snapshot().due[0], { ...context, fixed: true, facing: 'right' })?.name, 'A');
});

test('random time points are bounded, separated and differ with random input; a long suspend skips old windows', () => {
  let seed = 77;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const a: Animations = { ...base, ambient: { ...base.ambient!, minEpisodes: 3, maxEpisodes: 3 } };
  const d = new AmbientDirector(a, 0, random);
  const due = d.snapshot().due;
  assert.equal(due.length, 3);
  assert.ok(due.every((t) => t >= 12000 && t <= 168000));
  assert.ok(due.slice(1).every((t, i) => t - due[i] >= 25000));
  assert.equal(d.tick(1800000, context), null);
  assert.equal(d.snapshot().windowStart, 1800000);
  assert.ok(d.snapshot().due.every((t) => t > 1800000));
});
