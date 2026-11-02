/**
 * @generated 素材目录的构建入口：校验社区角色清单并复制运行所需文件，不触碰用户目录。
 * 由 npm run build 调用，assets/bundled-claude/ 可随时从源清单重建。
 * @module dsh-pet/scripts/prepare-pet-pack
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, '..', 'community-pets', 'claude-dafeiyu');
const destination = join(root, 'assets', 'bundled-claude');
const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
const configs = manifest.files.filter((item) => /^claude-dafeiyu(-lean)?-config\.json$/.test(item.source));
const videos = manifest.files.filter((item) => item.source.endsWith('.webm'));
if (
  configs.length !== 2 ||
  !videos.length ||
  new Set(manifest.files.map((item) => item.source)).size !== manifest.files.length
)
  throw new Error('角色清单必须包含两份独立配置与非空、无重复的视频集合');
for (const item of manifest.files) {
  const valid =
    /^claude-dafeiyu(-lean)?-config\.json$/.test(item.source) ||
    /^(animation|lean-animation)\/[\p{L}\p{N} _·，-]+\.webm$/u.test(item.source);
  if (
    !valid ||
    createHash('sha256')
      .update(readFileSync(join(source, item.source)))
      .digest('hex') !== item.sha256
  )
    throw new Error('角色素材无效：' + item.source);
}
// 只清理工作区内生成目录的旧视频，避免已撤下的素材残留进安装包。
const expected = new Set(manifest.files.map((item) => item.source));
for (const folder of ['animation', 'lean-animation']) {
  const directory = join(destination, folder);
  if (!existsSync(directory)) continue;
  const withinPackage = relative(realpathSync(root), realpathSync(directory));
  if (withinPackage.startsWith('..') || isAbsolute(withinPackage)) throw new Error('生成目录必须位于插件工作区内');
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.webm') && !expected.has(folder + '/' + entry.name))
      unlinkSync(join(directory, entry.name));
  }
}
for (const name of ['manifest.json', ...manifest.files.map((item) => item.source)]) {
  mkdirSync(dirname(join(destination, name)), { recursive: true });
  copyFileSync(join(source, name), join(destination, name));
}
console.log(
  `[prepare-pet-pack] verified and bundled ${videos.length} transparent animations and ${configs.length} configs`,
);
