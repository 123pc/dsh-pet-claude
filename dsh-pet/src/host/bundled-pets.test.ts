/** 内置角色初始化的用户数据保护、完整性与首次体验回归。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBundledPets } from './bundled-pets.ts';
import { readAllConfig, type ConfigPaths } from './config.ts';

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'claude-bundled-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  mkdirSync(join(source, 'animation'), { recursive: true });
  const names = ['claude-dafeiyu-config.json', 'claude-dafeiyu-lean-config.json', 'animation/安静站立.webm'];
  const files = names.map((name) => {
    const id = name.includes('-lean') ? 'claude-dafeiyu-lean' : 'claude-dafeiyu';
    const data = name.endsWith('.json')
      ? Buffer.from(
          JSON.stringify({
            pets: [{ id, name: id, display: id.endsWith('-lean') ? 'none' : 'both' }],
            outfit: { base: 'main', label: id },
          }),
        )
      : Buffer.from('fake-video-for-integrity-test');
    writeFileSync(join(source, name), data);
    return {
      source: name,
      target: name.replace(/^animation\//, 'claude-dafeiyu-animation/'),
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  });
  const manifest = { version: 'fixture', files };
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  const paths: ConfigPaths = {
    defaultFile: fileURLToPath(new URL('../../assets/config.jsonc', import.meta.url)),
    userFile: join(root, 'data', 'main-config.jsonc'),
    legacyUserFile: join(root, 'data', 'main-config.json'),
    petDir: join(root, 'data', 'pet'),
  };
  return { root, source, manifest, paths };
}

test('fresh install exposes standing, keeps lean available and hides the original', (t) => {
  const { source, paths } = fixture(t);
  assert.deepEqual(ensureBundledPets(paths, source), { added: 3, preserved: 0, fresh: true });
  const config = readAllConfig(paths);
  assert.equal((config.main.pets as Record<string, unknown>[])[0].display, 'none');
  const standing = (config['claude-dafeiyu'].pets as Record<string, unknown>[])[0];
  assert.equal(standing.display, 'both');
  assert.equal(standing.whisperEnabled, false);
  assert.equal(standing.balanceEnabled, false);
  assert.equal((standing.outfits as unknown[]).length, 3);
  assert.equal((config['claude-dafeiyu-lean'].pets as Record<string, unknown>[])[0].display, 'none');
});

test('existing main settings stay byte-identical and newly introduced pets remain hidden', (t) => {
  const { source, paths } = fixture(t);
  mkdirSync(join(paths.petDir, '..'), { recursive: true });
  const original = '// my preferences\n{"pets":[{"id":"main","size":444,"display":"desktop"}]}';
  writeFileSync(paths.userFile, original);
  ensureBundledPets(paths, source);
  assert.equal(readFileSync(paths.userFile, 'utf8'), original);
  const config = readAllConfig(paths);
  assert.equal((config['claude-dafeiyu'].pets as Record<string, unknown>[])[0].display, 'none');
  assert.equal((config.main.pets as Record<string, unknown>[])[0].size, 444);
});

test('restarts and upgrades never replace custom configuration or custom videos', (t) => {
  const { source, paths } = fixture(t);
  ensureBundledPets(paths, source);
  const config = join(paths.petDir, 'claude-dafeiyu-config.json');
  const video = join(paths.petDir, 'claude-dafeiyu-animation', '安静站立.webm');
  writeFileSync(config, '{"custom":"keep this exactly"}');
  writeFileSync(video, 'custom artwork');
  assert.deepEqual(ensureBundledPets(paths, source), { added: 0, preserved: 3, fresh: false });
  assert.equal(readFileSync(config, 'utf8'), '{"custom":"keep this exactly"}');
  assert.equal(readFileSync(video, 'utf8'), 'custom artwork');
  assert.ok(!readdirSync(paths.petDir, { recursive: true }).some((name) => String(name).endsWith('.tmp')));
});

test('a corrupted bundled video fails before creating any user file', (t) => {
  const { source, paths } = fixture(t);
  writeFileSync(join(source, 'animation', '安静站立.webm'), 'corrupted');
  assert.throws(() => ensureBundledPets(paths, source), /校验失败/);
  assert.equal(existsSync(paths.petDir), false);
  assert.equal(existsSync(paths.userFile), false);
});

test('path traversal in a bundle manifest fails before any write', (t) => {
  const { source, manifest, paths } = fixture(t);
  manifest.files[0].target = '../outside-config.json';
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => ensureBundledPets(paths, source), /路径无效/);
  assert.equal(existsSync(paths.petDir), false);
});

test('a junction or symlink in a destination directory never writes to its target', (t) => {
  const { root, source, paths } = fixture(t);
  const other = join(root, 'other');
  mkdirSync(other);
  mkdirSync(paths.petDir, { recursive: true });
  symlinkSync(other, join(paths.petDir, 'claude-dafeiyu-animation'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => ensureBundledPets(paths, source), /包含目录链接/);
  assert.deepEqual(readdirSync(other), []);
});

test('legacy main preferences and unrelated file pets are preserved', (t) => {
  const { source, paths } = fixture(t);
  mkdirSync(paths.petDir, { recursive: true });
  writeFileSync(paths.legacyUserFile!, '{"pets":[{"id":"main","display":"web"}]}');
  writeFileSync(join(paths.petDir, 'other-config.json'), '{"pets":[{"id":"other","display":"desktop"}]}');
  const before = readFileSync(paths.legacyUserFile!);
  assert.equal(ensureBundledPets(paths, source).fresh, false);
  assert.deepEqual(readFileSync(paths.legacyUserFile!), before);
  assert.equal(existsSync(paths.userFile), false);
  assert.equal((readAllConfig(paths)['claude-dafeiyu'].pets as Record<string, unknown>[])[0].display, 'none');
});

test('unbuilt source checkouts do not initialize any user configuration', (t) => {
  const { root, paths } = fixture(t);
  assert.deepEqual(ensureBundledPets(paths, join(root, 'not-built')), { added: 0, preserved: 0, fresh: false });
  assert.equal(existsSync(paths.petDir), false);
});

function upgradeFixture(t: { after: (fn: () => void) => void }) {
  const value = fixture(t);
  const { source, manifest, paths } = value;
  const name = 'claude-dafeiyu-config.json';
  const oldAnimations = { idle: ['安静站立'], categories: [] };
  const config = {
    pets: [{ id: 'claude-dafeiyu', size: 444, display: 'desktop', whisperEnabled: true }],
    notificationsEnabled: false,
    customPreference: { position: 'my saved corner' },
    animations: oldAnimations,
  };
  const nextAnimations = { ...oldAnimations, categories: [{ id: '新动作', actions: ['抱文件认真敬礼'] }] };
  const data = Buffer.from(JSON.stringify({ ...config, animations: nextAnimations }));
  writeFileSync(join(source, name), data);
  const row = manifest.files.find((file) => file.source === name)! as (typeof manifest.files)[number] & {
    previousAnimationsSha256: string[];
  };
  row.sha256 = createHash('sha256').update(data).digest('hex');
  row.previousAnimationsSha256 = [createHash('sha256').update(JSON.stringify(oldAnimations)).digest('hex')];
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  mkdirSync(paths.petDir, { recursive: true });
  const path = join(paths.petDir, name);
  const original = JSON.stringify(config);
  writeFileSync(path, original);
  return { ...value, path, config, original, nextAnimations, row };
}

test('known official animations upgrade once with an exact backup and unchanged preferences', (t) => {
  const { source, paths, path, config, original, nextAnimations } = upgradeFixture(t);
  const result = ensureBundledPets(paths, source);
  assert.equal(result.updated, 1);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { ...config, animations: nextAnimations });
  const backup = readdirSync(paths.petDir).find((name) => name.endsWith('.bak'))!;
  assert.equal(readFileSync(join(paths.petDir, backup), 'utf8'), original);
  const after = readFileSync(path);
  assert.equal(ensureBundledPets(paths, source).updated, undefined);
  assert.deepEqual(readFileSync(path), after);
  assert.equal(readdirSync(paths.petDir).filter((name) => name.endsWith('.bak')).length, 1);
  assert.equal(existsSync(paths.userFile), false);
});

test('custom animation definitions and custom artwork remain byte-identical on upgrade', (t) => {
  const { source, paths, path, config } = upgradeFixture(t);
  const custom = JSON.stringify({ ...config, animations: { ...config.animations, idle: ['my custom idle'] } });
  writeFileSync(path, custom);
  const video = join(paths.petDir, 'claude-dafeiyu-animation', '安静站立.webm');
  mkdirSync(join(paths.petDir, 'claude-dafeiyu-animation'));
  writeFileSync(video, 'my custom artwork');
  assert.equal(ensureBundledPets(paths, source).updated, undefined);
  assert.equal(readFileSync(path, 'utf8'), custom);
  assert.equal(readFileSync(video, 'utf8'), 'my custom artwork');
  assert.ok(!readdirSync(paths.petDir).some((name) => name.endsWith('.bak')));
});

test('invalid upgrade rules fail before copying missing files or replacing configuration', (t) => {
  const { source, manifest, paths, path, original, row } = upgradeFixture(t);
  row.previousAnimationsSha256 = ['not-a-hash'];
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => ensureBundledPets(paths, source), /升级规则无效/);
  assert.equal(readFileSync(path, 'utf8'), original);
  assert.equal(existsSync(join(paths.petDir, 'claude-dafeiyu-animation')), false);
});

test('a changed existing backup prevents replacement and leaves no temporary files', (t) => {
  const { source, paths, path, original } = upgradeFixture(t);
  const digest = createHash('sha256').update(original).digest('hex');
  writeFileSync(path + '.before-bundled-' + digest + '.bak', 'user edited backup');
  assert.equal(ensureBundledPets(paths, source).updated, undefined);
  assert.equal(readFileSync(path, 'utf8'), original);
  assert.ok(!readdirSync(paths.petDir).some((name) => name.endsWith('.tmp')));
});
