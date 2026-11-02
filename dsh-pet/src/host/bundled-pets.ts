/**
 * 内置角色初始化：补齐缺失文件，备份后升级已知官方动作配置。
 * 自定义动作、偏好及素材保留；不运行安装脚本，不访问网络。
 * 新目录默认显示站立形态，已有配置的用户通过换装自行选择新增形态。
 * @module dsh-pet/src/host/bundled-pets
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readAllConfig, type ConfigPaths } from './config.ts';

/** 完成校验的发行文件；内容仅来自包内清单。 */
interface PreparedFile {
  /** 用户目录中的相对目标。 */
  target: string;
  /** 校验后的源内容。 */
  data: Buffer;
  /** 可安全升级的旧版官方动作配置哈希。 */
  previousAnimationsSha256?: string[];
}

/** 初始化结果，不包含用户配置内容。 */
export interface BundledPetResult {
  /** 本次新增的文件数。 */
  added: number;
  /** 本次保留的已有文件数。 */
  preserved: number;
  /** 是否为没有用户主配置和文件宠物的新目录。 */
  fresh: boolean;
  /** 本次备份并更新的官方动作配置数。 */
  updated?: number;
}

/** 拒绝通过用户素材目录内的符号链接写到其它目录。 */
function safeTarget(root: string, relative: string): string {
  let path = resolve(root);
  for (const part of ['', ...relative.split('/')]) {
    path = part ? join(path, part) : path;
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('角色目标包含目录链接：' + path);
  }
  return path;
}

/** 完整校验所有源文件后才允许向用户目录写入。 */
function prepareFiles(sourceRoot: string): PreparedFile[] {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'manifest.json'), 'utf8')) as {
    files?: { source: string; target: string; sha256: string; previousAnimationsSha256?: string[] }[];
  };
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('内置角色清单为空');
  const seen = new Set<string>();
  return manifest.files.map((file) => {
    const config = /^claude-dafeiyu(-lean)?-config\.json$/.test(file.source);
    const media = /^(animation|lean-animation)\/[\p{L}\p{N} _·，-]+\.webm$/u.test(file.source);
    const expected = file.source
      .replace(/^animation\//, 'claude-dafeiyu-animation/')
      .replace(/^lean-animation\//, 'claude-dafeiyu-lean-animation/');
    if ((!config && !media) || file.target !== expected || seen.has(file.target)) throw new Error('内置角色路径无效');
    seen.add(file.target);
    const data = readFileSync(join(sourceRoot, file.source));
    if (createHash('sha256').update(data).digest('hex') !== file.sha256)
      throw new Error('内置角色校验失败：' + file.source);
    if (config) {
      const parsed = JSON.parse(data.toString('utf8')) as { pets?: unknown[] };
      if (!Array.isArray(parsed.pets) || parsed.pets.length === 0) throw new Error('内置角色配置无效：' + file.source);
    }
    if (
      file.previousAnimationsSha256 !== undefined &&
      (!config ||
        !Array.isArray(file.previousAnimationsSha256) ||
        !file.previousAnimationsSha256.every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
    )
      throw new Error('内置角色升级规则无效：' + file.source);
    return { target: file.target, data, previousAnimationsSha256: file.previousAnimationsSha256 };
  });
}

/** 用同目录临时文件及排他硬链接发布完整内容；已有目标永不替换。 */
function addFile(path: string, data: Buffer | string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.claude-' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, data, { flag: 'wx' });
    try {
      linkSync(temporary, path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** 检查用户是否已经配置主角色或安装其它文件宠物。 */
function isFresh(paths: ConfigPaths): boolean {
  if (existsSync(paths.userFile) || (paths.legacyUserFile && existsSync(paths.legacyUserFile))) return false;
  return !existsSync(paths.petDir) || !readdirSync(paths.petDir).some((name) => /-config\.(json|jsonc)$/.test(name));
}

/** 仅替换匹配已知官方哈希的 animations；先保存原文件，再原子发布并保留全部其它字段。 */
function upgradeAnimations(root: string, file: PreparedFile): boolean {
  if (!file.previousAnimationsSha256?.length) return false;
  const path = safeTarget(root, file.target);
  const original = readFileSync(path);
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (!current || typeof current !== 'object' || Array.isArray(current) || !current.animations) return false;
  const before = JSON.stringify(current.animations);
  if (!file.previousAnimationsSha256.includes(createHash('sha256').update(before).digest('hex'))) return false;
  const next = JSON.parse(file.data.toString('utf8')) as Record<string, unknown>;
  if (!next.animations || typeof next.animations !== 'object' || Array.isArray(next.animations)) return false;
  if (before === JSON.stringify(next.animations)) return false;
  const digest = createHash('sha256').update(original).digest('hex');
  const backup = safeTarget(root, file.target + '.before-bundled-' + digest + '.bak');
  addFile(backup, original);
  if (!readFileSync(backup).equals(original)) return false;
  const temporary = path + '.claude-' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify({ ...current, animations: next.animations }, null, 2) + '\n', {
      flag: 'wx',
    });
    safeTarget(root, file.target);
    if (!readFileSync(path).equals(original)) return false;
    renameSync(temporary, path);
    return true;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/**
 * 补齐内置角色并升级未自定义的官方动作；不自动增加已有目录的可见角色。
 * @param paths - 现有宿主配置路径。
 * @param sourceRoot - 由发布流程生成的包内角色目录。
 * @returns 新增、更新和保留文件数；源码尚未构建角色目录时返回零。
 * @throws {Error} 发行清单损坏、路径含链接或用户目录不可写时抛出。
 */
export function ensureBundledPets(paths: ConfigPaths, sourceRoot: string): BundledPetResult {
  if (!existsSync(join(sourceRoot, 'manifest.json'))) return { added: 0, preserved: 0, fresh: false };
  const files = prepareFiles(sourceRoot);
  for (const file of files) safeTarget(paths.petDir, file.target);
  const fresh = isFresh(paths);
  const main = fresh ? readAllConfig(paths).main : undefined;
  const result: BundledPetResult = { added: 0, preserved: 0, fresh };
  // 最后发布配置：复制视频中途失败不会留下指向不完整角色的新增配置。
  files.sort((a, b) => Number(a.target.endsWith('.json')) - Number(b.target.endsWith('.json')));
  for (const file of files) {
    let data = file.data;
    if (file.target.endsWith('-config.json')) {
      const config = JSON.parse(data.toString('utf8')) as { pets: Record<string, unknown>[] };
      for (const pet of config.pets) {
        if (!fresh) pet.display = 'none';
        pet.whisperEnabled = false;
        pet.balanceEnabled = false;
      }
      data = Buffer.from(JSON.stringify(config, null, 2) + '\n');
    }
    const path = safeTarget(paths.petDir, file.target);
    if (addFile(path, data)) result.added++;
    else if (upgradeAnimations(paths.petDir, file)) result.updated = (result.updated ?? 0) + 1;
    else result.preserved++;
  }
  if (main) {
    const pets = (main.pets as Record<string, unknown>[]).map((pet) => ({
      ...pet,
      display: 'none',
      whisperEnabled: false,
      balanceEnabled: false,
    }));
    addFile(paths.userFile, JSON.stringify({ pets }, null, 2) + '\n');
  }
  return result;
}
