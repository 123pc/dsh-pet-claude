/**
 * 桌面事件薄壳的实际衔接测试，不启动 Electron 或触碰真实工作状态。
 * @module dsh-pet/src/shared/work-sequence-runtime.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import * as sequence from './work-sequence.ts';
import * as pickers from './pickers.ts';

function sprite() {
  const context = vm.createContext({
    navigator: { platform: 'Win32' },
    BASE: '',
    config: {},
    console: { log() {}, error() {} },
    window: { setTimeout: () => 1, clearTimeout() {} },
    BUBBLE_DURATION_MS: 10000,
    S: {
      ...sequence,
      ...pickers,
      isNoMirrorAnimation: () => false,
      WORK_STATUS_INDEX: { thinking: 0, working: 1, result: 2, waiting: 3, success: 4, error: 5 },
    },
  });
  const root = process.env.DSH_PET_SEQUENCE_TEST_RUNTIME;
  const source = (file: string) =>
    readFileSync(
      root
        ? join(root, 'runtime/electron-helper', file)
        : new URL('../../runtime/electron-helper/' + file, import.meta.url),
      'utf8',
    );
  for (const file of ['sprite.js', 'sprite/playback.js']) vm.runInContext(source(file), context);
  vm.runInContext(source('events.js'), context);
  const proto = vm.runInContext('PetSprite.prototype', context);
  const history: string[] = [];
  const value = Object.assign(Object.create(proto), {
    pet: { id: 'test-lean', workStatusEnabled: true },
    frozen: false,
    prevWorkTick: 0,
    workPhase: 'closed',
    workState: null,
    workTimer: null,
    anim: 'idle',
    playback: null,
    dragState: { active: false },
    animations: {
      idle: ['idle'],
      turn: [],
      drag: [],
      clicks: ['click'],
      workSequence: { enter: 'enter', loops: ['typing', 'thinking'], exit: 'exit' },
      events: {
        workStatus: [
          ['typing', 'thinking'],
          ['typing', 'thinking'],
          ['typing', 'thinking'],
          ['typing', 'thinking'],
          'done',
          'error',
        ],
      },
    },
    stopMove() {},
    renderBubble() {},
    playOnce(name: string) {
      this.anim = name;
      history.push(name);
    },
    switchTo(name: string) {
      this.anim = name;
      history.push(name);
    },
  });
  return { value, history };
}

test('desktop greeting acknowledges once, follows task updates and leaves failures to their own tier', () => {
  const { value: s, history } = sprite();
  s.animations.workSequence.introOnly = true;
  s.animations.workSequence.enterText = '收到任务，马上开始！';
  s.animations.workSequence.exit = 'idle';
  s.playAmbient({ name: 'idle', rest: true, label: '待机' });
  assert.equal(s.workPhase, 'closed');
  history.length = 0;
  s.onWorkTick({ state: 'thinking', task: '第一步' }, 1);
  s.onWorkTick({ state: 'working', task: '第二步' }, 2);
  assert.deepEqual(history, ['enter']);
  assert.equal(s.workPhase, 'opening');
  assert.equal(s.workText, '第二步');
  s.handleEnded();
  assert.equal(s.workPhase, 'open');
  assert.ok(['typing', 'thinking'].includes(s.anim));
  s.onWorkTick({ state: 'result', task: '第三步' }, 3);
  s.onWorkTick({ state: 'working', task: '第四步' }, 4);
  assert.equal(history.filter((name) => name === 'enter').length, 1);
  s.onWorkTick({ state: 'error' }, 5);
  assert.equal(s.anim, 'error');
  assert.equal(history.includes('exit'), false);
  s.onWorkTick({ state: 'thinking', task: '下一个任务' }, 6);
  assert.equal(s.anim, 'enter');
});

test('desktop ticks and ended form enter → work variations → exit → idle', () => {
  const { value: s, history } = sprite();
  s.onWorkTick({ state: 'thinking' }, 1);
  s.onWorkTick({ state: 'working', task: 'new progress' }, 2);
  assert.deepEqual(history, ['enter']);
  s.handleEnded();
  assert.ok(['typing', 'thinking'].includes(s.anim));
  const current = s.anim;
  s.onWorkTick({ state: 'result' }, 3);
  assert.equal(s.anim, current);
  s.handleEnded();
  assert.notEqual(s.anim, current);
  s.onWorkTick({ state: 'success' }, 4);
  assert.equal(s.anim, 'exit');
  s.onWorkTick({ state: null }, 5);
  s.handleEnded();
  assert.equal(s.anim, 'idle');
  assert.equal(history.filter((n) => n === 'enter').length, 1);
  assert.equal(history.filter((n) => n === 'exit').length, 1);
});

test('desktop short tasks and user interruptions retain the sequence guards', () => {
  const { value: s } = sprite();
  s.onWorkTick({ state: 'working' }, 1);
  s.onWorkTick({ state: null }, 2);
  assert.equal(s.anim, 'enter');
  s.handleEnded();
  assert.equal(s.anim, 'exit');
  s.onWorkTick({ state: 'working' }, 3);
  s.handleEnded();
  assert.equal(s.anim, 'enter');
  s.handleEnded();
  s.anim = 'click';
  assert.equal(s.resumeWorkStatusAnim(), true);
  assert.ok(['typing', 'thinking'].includes(s.anim));
  s.frozen = true;
  const before = s.anim;
  s.handleEnded();
  assert.equal(s.anim, before);
});
