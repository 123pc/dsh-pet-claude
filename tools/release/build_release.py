"""Build README previews and a Windows portable archive from verified runtime files.

Requires Pillow/imageio-ffmpeg and an already built plugin. No source art or user
configuration is included. Electron is copied from an explicit local directory.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageOps
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'community-pets/claude-dafeiyu'
MEDIA = ROOT / 'docs/media'
FPS = 8


def frames(name, fps=FPS):
    raw = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-c:v', 'libvpx-vp9',
        '-i', str(PACK / name), '-vf', f'fps={fps}', '-f', 'rawvideo',
        '-pix_fmt', 'rgba', 'pipe:1',
    ], check=True, capture_output=True).stdout
    stride = 640 * 360 * 4
    assert raw and len(raw) % stride == 0, name
    return [Image.frombytes('RGBA', (640, 360), raw[i:i+stride]) for i in range(0, len(raw), stride)]


def make_gif(images, output, size=(336, 304), fps=FPS):
    """Keep a fixed crop, scale and palette throughout the original animation."""
    bounds = [frame.getchannel('A').getbbox() for frame in images]
    assert all(bounds), output
    box = (max(0, min(b[0] for b in bounds)-12), max(0, min(b[1] for b in bounds)-12),
           min(640, max(b[2] for b in bounds)+12), min(360, max(b[3] for b in bounds)+12))
    rendered = []
    for frame in images:
        sprite = ImageOps.contain(frame.crop(box), (size[0]-24, size[1]-24), Image.Resampling.LANCZOS)
        canvas = Image.new('RGB', size, '#f4f3f0')
        canvas.paste(sprite, ((size[0]-sprite.width)//2, size[1]-sprite.height-12), sprite)
        rendered.append(canvas)
    samples = [rendered[i] for i in range(0, len(rendered), max(1, len(rendered)//12))][:12]
    atlas = Image.new('RGB', (size[0], size[1]*len(samples)))
    for i, sample in enumerate(samples):
        atlas.paste(sample, (0, i*size[1]))
    palette = atlas.quantize(colors=192)
    quantized = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in rendered]
    output.parent.mkdir(parents=True, exist_ok=True)
    quantized[0].save(output, save_all=True, append_images=quantized[1:],
                      duration=[(120 if i%2==0 else 130) if fps==8 else round((i+1)*100/fps)*10-round(i*100/fps)*10 for i in range(len(quantized))],
                      loop=0, optimize=True, disposal=1)


def previews():
    MEDIA.mkdir(parents=True, exist_ok=True)
    clips = {
        'walk': ['animation/自然走路.webm'],
        'wave': ['animation/点击回应-元气挥手.webm'],
        'cube': ['animation/原地专心玩魔方.webm'],
        'lean-tail': ['lean-animation/托腮·轻摇鲸尾.webm'],
        'lean-hair': ['lean-animation/托腮·指尖拨头发.webm'],
        'lean-hum': ['lean-animation/托腮·摇头哼歌.webm'],
        'office': ['lean-animation/' + name + '.webm' for name in [
            '托腮办公·拿出并打开电脑', '托腮办公·轻敲键盘',
            '托腮办公·揉眼伸肩', '托腮办公·收起电脑']],
    }
    record = {}
    for key, names in clips.items():
        images = []
        for name in names:
            images.extend(frames(name))
        size = (640, 360) if key == 'office' else (336, 304)
        output = MEDIA / (key + '.gif')
        make_gif(images, output, size)
        record[key] = {'sources': names, 'frames': len(images), 'bytes': output.stat().st_size}
        print(f'preview {key}: {output.stat().st_size:,} bytes', flush=True)

    hero = Image.new('RGB', (1120, 640), '#f2eee7')
    draw = ImageDraw.Draw(hero)
    font_path = next((p for p in [Path('C:/Windows/Fonts/msyh.ttc'),
                    Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')]
                      if p.exists()), None)
    def font(size):
        return ImageFont.truetype(str(font_path), size) if font_path else ImageFont.load_default(size)
    draw.text((48, 28), 'CLAUDE / DAFEIYU', fill='#ad622e', font=font(20))
    draw.text((48, 64), '两种形态，一只大肥鱼。', fill='#24344c', font=font(38))
    for x, label, source in [
        (48, 'Claude-大肥鱼-站立', 'animation/安静站立·眨眼呼吸.webm'),
        (584, 'Claude-大肥鱼-托腮', 'lean-animation/托腮·安静陪伴.webm'),
    ]:
        draw.rounded_rectangle((x, 142, x+488, 592), radius=24, fill='#fffdf9')
        frame = frames(source)[0]
        sprite = ImageOps.contain(frame.crop(frame.getchannel('A').getbbox()), (424, 330), Image.Resampling.LANCZOS)
        hero.paste(sprite, (x+(488-sprite.width)//2, 174+(330-sprite.height)//2), sprite)
        draw.text((x+244, 544), label, font=font(24), anchor='mm', fill='#24344c')
    hero.save(MEDIA / 'hero.png', optimize=True)
    (MEDIA / 'sources.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def verify_pack():
    manifest = json.loads((PACK / 'manifest.json').read_text(encoding='utf-8'))
    for entry in manifest['files']:
        assert hashlib.sha256((PACK / entry['source']).read_bytes()).hexdigest() == entry['sha256'], entry['source']
    return manifest


def zip_tree(folder, target):
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                assert not path.is_symlink(), path
                archive.write(path, path.relative_to(folder).as_posix())


def package(electron, plugin, out):
    manifest = verify_pack()
    assert (electron / 'electron.exe').is_file(), 'Pass an extracted Windows x64 Electron directory'
    assert (ROOT / 'dsh-pet/lib/app.js').is_file(), 'Run npm run prepack first'
    assert (ROOT / 'dsh-pet/runtime/electron-helper/shared-core.js').is_file()
    assert plugin.is_file() and plugin.suffix == '.tgz'
    out.mkdir(parents=True, exist_ok=True)
    stage = out / 'portable-stage'
    assert not stage.exists(), 'Use a fresh output directory; do not overwrite a previous release stage'
    stage.mkdir()
    shutil.copytree(electron, stage / 'runtime')
    (stage / 'runtime/electron.exe').rename(stage / 'runtime/Claude-Dafeiyu.exe')
    app = stage / 'runtime/resources/app'
    app.mkdir()
    for name in ['lib', 'runtime', 'assets']:
        shutil.copytree(ROOT / 'dsh-pet' / name, app / name,
                        ignore=shutil.ignore_patterns('preview', '__pycache__', '*.map'))
    package_json = json.loads((ROOT / 'dsh-pet/package.json').read_text(encoding='utf-8'))
    package_json['main'] = 'portable.mjs'
    (app / 'package.json').write_text(json.dumps(package_json, ensure_ascii=False, indent=2), encoding='utf-8')
    shutil.copy2(ROOT / 'tools/release/portable.mjs', app / 'portable.mjs')
    # Distribute only declared runtime media and installer documents, never the
    # local frame previews or source atlases used to draw the animations.
    pet_stage = stage / 'pet-pack'
    for name in ['manifest.json', *[item['source'] for item in manifest['files']],
                 'install.ps1', 'uninstall.ps1', 'Pack.ps1', 'ACTIVITY-CHAINS.md',
                 'verify.py', 'requirements.txt', 'tests/install.test.ps1']:
        destination = pet_stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(PACK / name, destination)
    shutil.copy2(ROOT / 'tools/release/Pack-README.md', stage / 'pet-pack/README.md')
    for name in ['Start-Claude.ps1', '启动桌宠.cmd']:
        shutil.copy2(ROOT / 'tools/release' / name, stage / name)
    # Windows PowerShell 5.1 needs a BOM for the Chinese default instance name.
    (stage / 'Start-Claude.ps1').write_text(
        (ROOT / 'tools/release/Start-Claude.ps1').read_text(encoding='utf-8'), encoding='utf-8-sig')
    shutil.copy2(ROOT / 'LICENSE', stage / 'LICENSE-dsh-pet.txt')
    shutil.copytree(ROOT / 'docs/licenses', stage / 'licenses')
    shutil.copy2(ROOT / 'THIRD-PARTY.md', stage / 'THIRD-PARTY.md')
    (stage / '使用说明.txt').write_text(
        'Claude 大肥鱼桌宠\n\n双击 启动桌宠.cmd，无需安装 DSH 或 Node.js。\n'
        '右键 → 换装；托盘 → 退出。设置保存在本目录 data/，升级时保留。\n'
        '请保留完整目录，不要只复制内部 EXE。\n\n'
        '项目：https://github.com/123pc/dsh-pet-claude\n'
        '基于 PC2005-cloud/dsh-pet，保留 MIT 版权声明。\n', encoding='utf-8-sig')
    zip_tree(stage, out / 'claude-dafeiyu-windows-x64.zip')
    zip_tree(stage / 'pet-pack', out / 'claude-dafeiyu-pet-pack.zip')
    if plugin.resolve() != (out / plugin.name).resolve():
        shutil.copy2(plugin, out / plugin.name)
    shutil.copy2(ROOT / '.tools/THIRD-PARTY-SOURCE.zip', out / 'THIRD-PARTY-SOURCE.zip')
    assets = sorted([*out.glob('*.zip'), *out.glob('*.tgz')])
    (out / 'SHA256SUMS.txt').write_text(''.join(
        hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in assets), encoding='utf-8')
    print(json.dumps({'assets': [{'name': p.name, 'bytes': p.stat().st_size} for p in assets]}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--media-only', action='store_true')
    parser.add_argument('--electron', type=Path)
    parser.add_argument('--plugin', type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / '.tools/release-build')
    args = parser.parse_args()
    verify_pack()
    if args.media_only:
        previews()
    else:
        if not args.electron or not args.plugin:
            parser.error('--electron and --plugin are required for packaging; run npm pack after prepack')
        package(args.electron.resolve(), args.plugin.resolve(), args.out.resolve())
