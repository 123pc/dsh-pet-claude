/**
 * 动画扩展兼容回归：旧角色不变，损坏扩展不替换角色，文件宠物之间不串配置。
 * @module dsh-pet/src/host/animation-extensions.test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeAnimationExtensions } from './animation-extensions.ts';
import { readAllConfig, saveUserConfig } from './config.ts';

const legacy = {
  idle: ['rest'],
  turn: [],
  drag: [],
  clicks: [],
  moves: { default: {}, actions: [] },
  categories: [{ id: 'daily', weight: 1, actions: ['enter', 'type', 'exit', 'nap'] }],
  events: { balance: ['balance'] },
};
const sequence = { enter: 'enter', loops: ['type'], exit: 'exit' };
const ambient = {
  windowSec: 180,
  minEpisodes: 1,
  maxEpisodes: 3,
  minGapSec: 25,
  edgeSec: 12,
  chainChance: 0.8,
  chains: [{ id: 'nap', label: 'Rest', weight: 1, steps: [{ name: 'nap', repeats: 2 }] }],
};

test('old configs and valid extensions retain identity and unknown metadata', () => {
  assert.equal(sanitizeAnimationExtensions(legacy), legacy);
  const a = { ...legacy, workSequence: sequence, ambient, futureExtension: { version: 2 } };
  assert.equal(sanitizeAnimationExtensions(a), a);
});

test('invalid optional extensions are isolated, leave input untouched, and report their keys', () => {
  for (const key of ['ambient', 'workSequence'] as const) {
    const input = { ...legacy, workSequence: sequence, ambient, [key]: null };
    const before = structuredClone(input),
      warnings: string[] = [];
    const out = sanitizeAnimationExtensions(input, (k) => warnings.push(k));
    assert.equal(out[key], undefined);
    assert.deepEqual(out[key === 'ambient' ? 'workSequence' : 'ambient'], key === 'ambient' ? sequence : ambient);
    assert.deepEqual(out.categories, legacy.categories);
    assert.deepEqual(input, before);
    assert.deepEqual(warnings, [key]);
  }
});

test('work sequences cannot introduce unregistered animations or non-animation paths', () => {
  for (const bad of [
    { ...sequence, enter: '../missing' },
    { ...sequence, loops: ['missing'] },
    { ...sequence, exit: '' },
  ]) {
    const out = sanitizeAnimationExtensions({ ...legacy, workSequence: bad, ambient });
    assert.equal(out.workSequence, undefined);
    assert.equal(out.ambient, ambient);
  }
});

test('greeting metadata is optional and bounded without weakening animation registration', () => {
  const greeting = { ...sequence, introOnly: true, enterText: '收到任务，马上开始！' };
  assert.equal(sanitizeAnimationExtensions({ ...legacy, workSequence: greeting }).workSequence, greeting);
  for (const bad of [
    { ...greeting, introOnly: 'true' },
    { ...greeting, enterText: ' ' },
    { ...greeting, enterText: 'x'.repeat(81) },
  ])
    assert.equal(sanitizeAnimationExtensions({ ...legacy, workSequence: bad }).workSequence, undefined);
});

test('schedule bounds reject non-finite weights, duplicates, excessive repeats and invalid windows', () => {
  const badValues = [
    { ...ambient, windowSec: 0 },
    { ...ambient, chainChance: 2 },
    { ...ambient, minEpisodes: 4, maxEpisodes: 2 },
    { ...ambient, chains: [{ ...ambient.chains[0], weight: Infinity }] },
    { ...ambient, chains: [{ ...ambient.chains[0], weight: Number.MAX_VALUE }] },
    { ...ambient, chains: [ambient.chains[0], ambient.chains[0]] },
    { ...ambient, chains: [{ ...ambient.chains[0], steps: [{ name: 'nap', repeats: 11 }] }] },
  ];
  for (const bad of badValues)
    assert.equal(sanitizeAnimationExtensions({ ...legacy, ambient: bad }).ambient, undefined);
});

test('the real config pipeline keeps custom pools, isolates file pets, and preserves disk on read/save', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-animation-compat-'));
  const paths = {
    defaultFile: fileURLToPath(new URL('../../assets/config.jsonc', import.meta.url)),
    userFile: join(dir, 'main-config.jsonc'),
    petDir: join(dir, 'pet'),
  };
  try {
    const original = readAllConfig(paths).main;
    const a = {
      ...legacy,
      ambient: { ...ambient, windowSec: 0 },
      workSequence: sequence,
      futureExtension: { keep: true },
    };
    const raw = JSON.stringify({ animations: a });
    writeFileSync(paths.userFile, raw);
    mkdirSync(paths.petDir);
    writeFileSync(
      join(paths.petDir, 'custom-config.json'),
      JSON.stringify({ pets: [{ id: 'custom', name: 'Custom' }], animations: { ...legacy, ambient } }),
    );
    const merged = readAllConfig(paths);
    const main = merged.main.animations as Record<string, unknown>;
    const custom = merged.custom.animations as Record<string, unknown>;
    assert.deepEqual(main.idle, ['rest']);
    assert.equal(main.ambient, undefined);
    assert.deepEqual(main.workSequence, sequence);
    assert.deepEqual(main.futureExtension, { keep: true });
    assert.deepEqual(custom.ambient, ambient);
    assert.equal(custom.workSequence, undefined);
    assert.deepEqual(
      original.animations,
      readAllConfig({ ...paths, userFile: join(dir, 'absent'), petDir: join(dir, 'absent-pets') }).main.animations,
    );
    assert.equal(readFileSync(paths.userFile, 'utf8'), raw);
    const saved = saveUserConfig({ pets: merged.main.pets }, { animations: a });
    assert.deepEqual(saved?.animations, a);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
