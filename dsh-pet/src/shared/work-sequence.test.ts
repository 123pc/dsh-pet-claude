/**
 * 办公衔接回归：重复 tick、短任务与收起中重开均保持道具顺序。
 * @module dsh-pet/src/shared/work-sequence.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceWorkSequence as step } from './work-sequence.ts';
const seq = { enter: 'open-laptop', loops: ['type', 'think'], exit: 'close-laptop' };

test('greeting-only entry plays once and returns control to the latest work tier', () => {
  const intro = { ...seq, introOnly: true, enterText: '收到任务，马上开始！' };
  assert.deepEqual(step(intro, 'closed', 'thinking', 'idle'), { phase: 'opening', name: seq.enter, handled: true });
  assert.equal(step(intro, 'opening', 'working', seq.enter).name, null);
  assert.deepEqual(step(intro, 'opening', 'working', seq.enter, true), { phase: 'open', name: null, handled: false });
  for (const state of ['working', 'result', 'waiting', 'thinking'])
    assert.deepEqual(step(intro, 'open', state, 'type'), { phase: 'open', name: null, handled: false });
  assert.deepEqual(step(intro, 'open', 'success', 'type'), { phase: 'closed', name: null, handled: false });
  assert.equal(step(intro, 'closed', 'thinking', 'done').name, seq.enter);
});

test('greeting respects user interruption and terminal state without replay or a false celebration', () => {
  const intro = { ...seq, introOnly: true };
  assert.deepEqual(step(intro, 'opening', 'working', 'click', true), { phase: 'open', name: null, handled: false });
  for (const state of [null, 'success', 'error'])
    assert.deepEqual(step(intro, 'opening', state, seq.enter), { phase: 'closed', name: null, handled: false });
});

test('enter once; progress ticks keep the current animation; then rotate work and close', () => {
  assert.deepEqual(step(seq, 'closed', 'thinking', 'idle'), { phase: 'opening', name: seq.enter, handled: true });
  assert.deepEqual(step(seq, 'opening', 'working', seq.enter), { phase: 'opening', name: null, handled: true });
  const work = step(seq, 'opening', 'working', seq.enter, true);
  assert.equal(work.phase, 'open');
  assert.ok(seq.loops.includes(work.name!));
  assert.equal(step(seq, 'open', 'result', work.name!).name, null);
  assert.notEqual(step(seq, 'open', 'working', work.name!, true).name, work.name);
  assert.deepEqual(step(seq, 'open', 'success', 'type'), { phase: 'closing', name: seq.exit, handled: true });
  assert.equal(step(seq, 'closing', null, seq.exit).name, null);
  assert.deepEqual(step(seq, 'closing', null, seq.exit, true), { phase: 'closed', name: null, handled: false });
});

test('a short task finishes opening before closing; a new task waits for closing to finish', () => {
  assert.equal(step(seq, 'opening', null, seq.enter).name, null);
  assert.equal(step(seq, 'opening', null, seq.enter, true).name, seq.exit);
  assert.equal(step(seq, 'closing', 'working', seq.exit).name, null);
  assert.deepEqual(step(seq, 'closing', 'working', seq.exit, true), {
    phase: 'opening',
    name: seq.enter,
    handled: true,
  });
});

test('interruption resumes an already open laptop; packs without a sequence keep their event behavior', () => {
  assert.ok(seq.loops.includes(step(seq, 'open', 'waiting', 'click').name!));
  assert.equal(step(undefined, 'closed', 'working', 'idle').handled, false);
  assert.equal(step(seq, 'closed', 'success', 'idle').handled, false);
});

test('a clicked-away transition cannot strand the next task waiting for an obsolete ended event', () => {
  assert.equal(step(seq, 'opening', 'working', 'click', true).name, seq.enter);
  assert.equal(step(seq, 'opening', null, 'click', true).name, seq.exit);
  assert.equal(step(seq, 'closing', 'working', 'click', true).name, seq.enter);
  assert.deepEqual(step(seq, 'closing', null, 'click', true), { phase: 'closed', name: null, handled: false });
});
