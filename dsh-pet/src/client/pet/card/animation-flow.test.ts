/** Browser adapter integration: use the real hook with a deterministic clock and state sink. */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationFlow, type AnimationFlow, type AnimationFlowRuntime } from './animation-flow.ts';
import type { CardHub } from './hub.ts';
import type { Animations } from '../../../shared/types.ts';
import type { WorkStatusSnapshot } from '../../../shared/work-status.ts';

function setup(t: TestContext, office = false, legacy = false) {
  let now = 0,
    busy = false,
    frozen = false,
    cleared = 0;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(Math, 'random', () => 0.05);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setInterval: () => 1,
      clearInterval: () => {
        cleared++;
      },
    },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const animations: Animations = {
    idle: ['idle'],
    turn: ['turn'],
    drag: ['drag'],
    clicks: ['click'],
    moves: { default: {}, actions: [] },
    categories: [{ id: 'daily', weight: 1, actions: ['A', 'B'] }],
    events: { workStatus: [['typing', 'thinking'], ['typing', 'thinking'], 'typing', 'thinking', 'done', 'error'] },
    workSequence: { enter: 'enter', loops: ['typing', 'thinking'], exit: 'exit' },
    ambient: {
      windowSec: 180,
      minEpisodes: 1,
      maxEpisodes: 1,
      edgeSec: 12,
      minGapSec: 25,
      chainChance: 1,
      chains: [
        {
          id: 'chain',
          label: 'chain',
          weight: 1,
          steps: (office ? ['enter', 'typing', 'exit'] : ['A', 'B']).map((name) => ({ name })),
        },
      ],
    },
  };
  if (legacy) {
    delete animations.ambient;
    delete animations.workSequence;
  }
  const history: Array<{ name: string; once: boolean }> = [];
  let introText: string | null = null;
  const card = {
    animRef: { current: 'idle' },
    facingRef: { current: 'left' },
    state: { once: true },
    actions: {
      play(name: string, opts?: { once?: boolean }) {
        card.animRef.current = name;
        card.state.once = opts?.once ?? true;
        history.push({ name, once: card.state.once });
      },
      setAnim(name: string) {
        card.animRef.current = name;
      },
      setOnce(once: boolean) {
        card.state.once = once;
      },
      setFacing() {},
      bumpSeq() {},
    },
  };
  let flow: AnimationFlow;
  const hub = {
    bubbles: {
      updateWorkIntro: (text: string | null) => {
        introText = text;
      },
    },
    card,
    cfg: () => ({
      id: 'test',
      workStatusEnabled: true,
      fixedEnabled: false,
      animations,
      animationWeights: { idle: 100, turn: 0, move: 0 },
    }),
    anims: () => animations,
    ownAnim: { isFrozen: () => frozen },
    isDragging: () => false,
    isAutonomyBlocked: () => busy,
    stopMotion: () => flow?.cancelAmbient(),
    tryWalk: () => false,
  } as unknown as CardHub;
  const refs: Array<{ current: unknown }> = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;
  const rt = {
    useRef<T>(initial: T) {
      return (refs[cursor++] ??= { current: initial }) as { current: T };
    },
    useEffect(effect: () => void | (() => void)) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    },
  } as AnimationFlowRuntime;
  const invokeFlow = createAnimationFlow(rt);
  function render(ws: WorkStatusSnapshot | null = null) {
    cursor = 0;
    flow = invokeFlow(hub, ws);
    return flow;
  }
  render();
  return {
    animations,
    card,
    history,
    intro: () => introText,
    get flow() {
      return flow;
    },
    render,
    setTime: (n: number) => {
      now = n;
    },
    setBusy: (b: boolean) => {
      busy = b;
    },
    setFrozen: (b: boolean) => {
      frozen = b;
    },
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
    cleared: () => cleared,
  };
}

test('browser greeting shows its text only during entry, then resumes the current work tier', (t) => {
  const f = setup(t);
  f.animations.workSequence!.introOnly = true;
  f.animations.workSequence!.enterText = '收到任务，马上开始！';
  f.animations.workSequence!.exit = 'idle';
  f.flow.tickAmbient();
  f.render({ state: 'thinking', task: '起步' });
  assert.equal(f.flow.stepWorkSequence('thinking'), true);
  assert.equal(f.intro(), '收到任务，马上开始！');
  f.render({ state: 'working', task: '第二步' });
  f.flow.stepWorkSequence('working');
  assert.equal(f.history.filter((item) => item.name === 'enter').length, 1);
  f.flow.applyEndedCue({ kind: 'random' });
  assert.equal(f.intro(), null);
  assert.ok(['typing', 'thinking'].includes(f.card.animRef.current));
  f.flow.stepWorkSequence('working');
  assert.equal(f.history.filter((item) => item.name === 'enter').length, 1);
  f.flow.stepWorkSequence('error');
  assert.equal(f.intro(), null);
  assert.equal(
    f.history.some((item) => item.name === 'exit'),
    false,
  );
  f.dispose();
});

test('browser independent clock interrupts looping idle, completes one chain, then rests', (t) => {
  const f = setup(t);
  f.flow.tickAmbient();
  assert.deepEqual(f.history, [{ name: 'idle', once: false }]);
  f.setTime(19800);
  f.flow.tickAmbient();
  assert.equal(f.card.animRef.current, 'A');
  f.flow.applyEndedCue({ kind: 'random' });
  assert.equal(f.card.animRef.current, 'B');
  f.flow.applyEndedCue({ kind: 'random' });
  assert.deepEqual(
    f.history.map((h) => h.name),
    ['idle', 'A', 'B', 'idle'],
  );
  assert.equal(f.card.state.once, false);
  f.dispose();
  assert.equal(f.cleared(), 1);
});

test('browser manual replay of the same action discards its remaining chain', (t) => {
  const f = setup(t);
  f.setTime(19800);
  f.flow.tickAmbient();
  f.flow.cancelAmbient();
  f.flow.applyEndedCue({ kind: 'random' });
  assert.equal(f.card.animRef.current, 'idle');
  assert.ok(!f.history.some((h) => h.name === 'B'));
});

test('browser busy and frozen missed events are discarded without catch-up', (t) => {
  const f = setup(t);
  f.setBusy(true);
  f.setTime(19800);
  f.flow.tickAmbient();
  f.setBusy(false);
  f.setTime(20800);
  f.flow.tickAmbient();
  assert.ok(!f.history.some((h) => h.name === 'A'));
  f.setFrozen(true);
  f.setTime(199800);
  f.flow.tickAmbient();
  f.setFrozen(false);
  f.setTime(200800);
  f.flow.tickAmbient();
  assert.ok(!f.history.some((h) => h.name === 'A'));
});

test('browser work ticks preserve entry, vary office loops, and close before returning to idle', (t) => {
  const f = setup(t);
  f.render({ state: 'thinking', task: null });
  f.flow.stepWorkSequence('thinking');
  assert.equal(f.card.animRef.current, 'enter');
  f.render({ state: 'working', task: 'updated' });
  f.flow.stepWorkSequence('working');
  assert.deepEqual(
    f.history.map((h) => h.name),
    ['enter'],
  );
  f.flow.applyEndedCue({ kind: 'random' });
  assert.equal(f.card.animRef.current, 'typing');
  f.render({ state: 'success', task: null });
  f.flow.stepWorkSequence('success');
  assert.equal(f.card.animRef.current, 'exit');
  f.flow.applyEndedCue({ kind: 'event-done' });
  assert.equal(f.card.animRef.current, 'idle');
});

test('browser autonomous laptop use hands its open prop to real work without replaying entry', (t) => {
  const f = setup(t, true);
  f.setTime(19800);
  f.flow.tickAmbient();
  assert.equal(f.card.animRef.current, 'enter');
  f.flow.applyEndedCue({ kind: 'random' });
  assert.equal(f.card.animRef.current, 'typing');
  f.render({ state: 'working', task: null });
  f.flow.stepWorkSequence('working');
  assert.equal(f.card.animRef.current, 'typing');
  f.flow.applyEndedCue({ kind: 'work-rotate', anim: 'thinking' });
  assert.equal(f.history.filter((h) => h.name === 'enter').length, 1);
  assert.equal(f.card.animRef.current, 'thinking');
});

test('browser hook rerenders keep the same random schedule and legacy pets keep the old random chain', (t) => {
  const f = setup(t);
  let calls = 0;
  t.mock.method(Math, 'random', () => {
    calls++;
    return 0.05;
  });
  f.render();
  f.render();
  assert.equal(calls, 0);
  const legacy = setup(t, false, true);
  legacy.flow.pickNext();
  assert.equal(legacy.card.animRef.current, 'idle');
  assert.equal(legacy.card.state.once, true);
  legacy.dispose();
  assert.equal(legacy.cleared(), 0);
});

for (const last of ['enter', 'typing']) {
  test(`browser closes a partial autonomous office chain ending at ${last} before resting`, (t) => {
    const f = setup(t, true);
    f.animations.ambient!.chains[0].steps = (last === 'enter' ? ['enter'] : ['enter', 'typing']).map((name) => ({
      name,
    }));
    f.setTime(19800);
    f.flow.tickAmbient();
    assert.equal(f.card.animRef.current, 'enter');
    if (last === 'typing') f.flow.applyEndedCue({ kind: 'random' });
    f.flow.applyEndedCue({ kind: 'random' });
    assert.equal(f.card.animRef.current, 'exit');
    f.flow.applyEndedCue({ kind: 'event-done' });
    assert.equal(f.card.animRef.current, 'idle');
    f.setTime(199800);
    f.flow.tickAmbient();
    assert.equal(
      f.card.animRef.current,
      'enter',
      'the next clock event must not remain blocked by a stale office phase',
    );
  });
}
