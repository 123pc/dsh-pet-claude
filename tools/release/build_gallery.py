"""Generate the visual README and a complete catalog from manifest-listed videos.

Uses the original video timing and full-character frames. The runtime pack is
read-only; documentation GIFs and their source index are the only media outputs.
"""
from pathlib import Path
from collections import OrderedDict
import hashlib
import json

from PIL import Image
from build_release import ROOT, PACK, FPS, frames, make_gif, verify_pack


def table(names, lookup, prefix, columns=3):
    lines = []
    for start in range(0, len(names), columns):
        row = names[start:start+columns]
        labels = [item[0] if isinstance(item, tuple) else item for item in row]
        keys = [item[1] if isinstance(item, tuple) else item for item in row]
        lines.extend([
            '| ' + ' | '.join(labels) + ' |',
            '| ' + ' | '.join(':---:' for _ in row) + ' |',
            '| ' + ' | '.join(f'<img src="{prefix}{lookup[key]["gif"]}" alt="{label}" width="{240 if len(row) == 3 else 320}">' for label, key in zip(labels, keys)) + ' |',
            '',
        ])
    return '\n'.join(lines)


def main():
    manifest = verify_pack()
    entries = [item for item in manifest['files'] if item['source'].endswith('.webm')]
    count = len(entries)
    previous_path = ROOT / 'docs/media/action-index.json'
    previous = json.loads(previous_path.read_text(encoding='utf8')) if previous_path.exists() else {}
    cached = {item['source']: item for item in previous.get('actions', [])}
    config = json.loads((PACK / 'claude-dafeiyu-config.json').read_text(encoding='utf-8'))
    anim = config['animations']
    groups = OrderedDict()
    groups['走动与互动'] = anim['idle'] + anim['turn'] + anim['drag'] + [x['name'] for x in anim['moves']['actions']] + anim['clicks']
    titles = {'小动作': '日常与休息', '玩耍': '玩耍与音乐', '吃什么': '开饭与零食',
              '时节': '时节与节日', '文字': '思考与碎碎念', '日常短待机': '日常与休息'}
    for category in anim['categories']:
        groups.setdefault(titles.get(category['id'], category['id']), []).extend(category['actions'])
    groups['思考与碎碎念'].extend(anim['events']['whisper'])
    groups['工作状态'] = anim['events']['workStatus']
    groups['余额表情'] = anim['events']['balance']
    groups['托腮与办公'] = [Path(item['source']).stem for item in entries if item['source'].startswith('lean-animation/')]
    assigned = [name for group in groups.values() for name in group]
    all_names = [Path(item['source']).stem for item in entries]
    assert len(assigned) == len(set(assigned)) == count and set(assigned) == set(all_names)
    group_for = {name: title for title, names in groups.items() for name in names}
    lookup = {}
    for index, entry in enumerate(entries, 1):
        name = Path(entry['source']).stem
        relative = f'media/actions/a{index:03}.gif'
        output = ROOT / 'docs' / relative
        old = cached.get(entry['source'])
        if old and old['sourceSha256'] == entry['sha256'] and old['gif'] == relative and output.exists():
            lookup[name] = {**old, 'group':group_for[name]}
            continue
        preview_fps = 24 if name == '跳起后张臂' else FPS
        decoded = frames(entry['source'], preview_fps)
        make_gif(decoded, output, fps=preview_fps)
        # Validate actual GIF decoding, looping and timing rather than just the filename.
        with Image.open(output) as image:
            assert image.info.get('loop') == 0 and image.size == (336, 304)
            duration = 0
            for frame in range(image.n_frames):
                image.seek(frame)
                duration += image.info['duration']
            assert abs(duration - len(decoded)/preview_fps*1000) <= 10
        lookup[name] = {'name': name, 'group': group_for[name], 'source': entry['source'],
                        'sourceSha256': entry['sha256'], 'gif': relative,
                        'durationMs': duration, 'bytes': output.stat().st_size}
        print(f'{index:03}/{count} {name}: {output.stat().st_size:,} bytes', flush=True)

    chains = []
    for key in ['sleepy', 'meal-walk', 'magic']:
        chain = next(x for x in anim['ambient']['chains'] if x['id'] == key)
        images = []
        for step in chain['steps']:
            decoded = frames(lookup[step['name']]['source'])
            images.extend(decoded * step.get('repeats', 1))
        relative = f'media/chains/{key}.gif'
        make_gif(images, ROOT / 'docs' / relative, (640, 360))
        chains.append({'id': key, 'label': chain['label'], 'steps': chain['steps'], 'gif': relative})
        print('chain:', chain['label'], flush=True)

    standing=sum(item['source'].startswith('animation/') for item in entries)
    catalog = ['# 全部动作图鉴', '', f'**{count} 段动画：站立 {standing} 段，托腮 {count-standing} 段。** 以下每一格都是对应的实际动作片段，点击动图可以放大。',
               '', '[返回项目首页](../README.md) · [随机日常与动作链](../community-pets/claude-dafeiyu/ACTIVITY-CHAINS.md)', '',
               '动图较多，可展开自己感兴趣的分类查看。', '']
    for title, names in groups.items():
        catalog.extend(['<details>', f'<summary><strong>{title} · {len(names)} 段</strong></summary>', '',
                        table(names, lookup, ''), '</details>', ''])
    (ROOT / 'docs/ACTIONS.md').write_text('\n'.join(catalog), encoding='utf-8')

    selections = OrderedDict([
        ('新动作：接单、欢呼与回眸', ['抱文件认真敬礼', '跳起后张臂', '转身回眸·发梢随风']),
        ('站起来，活动一下', ['自然走路', '点击回应-元气挥手', '超大伸懒腰', '哈欠连天', '原地小憩沉眠', '用鲸鱼尾巴拍打地面']),
        ('玩耍、音乐与一点小魔术', ['原地专心玩魔方', '撸猫', '放风筝', '荡秋千', '小提琴演奏', '变鸽子']),
        ('开饭了，今天吃点什么', ['吃白饭', '大口吃零食', '吃冰淇淋融化', '吃西瓜', '涮火锅', '吃大闸蟹']),
        ('小表情，也会回应你', ['点击回应-开心跃动', '点击回应-害羞惊讶', '点击回应-傲娇生气', '点击回应-挠痒咯咯笑', '被吓一跳', '女仆屈膝礼仪']),
        ('一年四季，都有一点仪式感', ['中秋赏月吃月饼', '堆雪人', '讨糖南瓜灯', '装点圣诞树', '放烟花', '收红包']),
        ('趴着陪你，也有自己的小动作', ['托腮·安静陪伴', '托腮·轻摇鲸尾', '托腮·指尖拨头发', '托腮·摇头哼歌', '托腮·眯眼小憩', '托腮·轻声回应']),
    ])
    showcase_count=sum(map(len,selections.values()))+5
    showcase = ['## 动作一览', '', f'**{showcase_count} 段单动作预览 + 完整办公过程 + 3 组动作链。** 想看更多，可以打开[全部 {count} 段动作图鉴](docs/ACTIONS.md)。',
                '', '走路会带着桌宠在屏幕上移动；点一点有回应，拖一拖换位置，右键可以换装、点播动作。', '']
    for title, names in selections.items():
        showcase.extend(['### ' + title, '', table(names, lookup, 'docs/')])
    office_names = ['托腮办公·拿出并打开电脑', '托腮办公·轻敲键盘', '托腮办公·停笔想一想', '托腮办公·揉眼伸肩', '托腮办公·收起电脑']
    showcase.extend(['### 你忙的时候，它也拿出电脑', '', '拿出并打开电脑 → 敲键盘或停笔思考 → 揉眼伸肩 → 合上收起，再回来陪你。', '',
                     '![托腮办公的完整过程](docs/media/office.gif)', '', table(office_names[:3], lookup, 'docs/'),
                     table(office_names[3:], lookup, 'docs/', 2), '## 动作连起来，就有了自己的小日常', '',
                     '平时安静陪伴，偶尔在随机时刻开始一段连贯的小活动，结束后再回到待机。下面按真实动作顺序和循环次数播放。', ''])
    for chain in chains:
        steps = ' → '.join(step['name'] for step in chain['steps'])
        showcase.extend(['### ' + chain['label'], '', steps, '', f'![{chain["label"]}](docs/{chain["gif"]})', ''])
    lean_config=json.loads((PACK/'claude-dafeiyu-lean-config.json').read_text(encoding='utf8'))
    chain_count=len(anim['ambient']['chains'])+len(lean_config['animations']['ambient']['chains'])
    showcase.extend([f'[全部 {chain_count} 条日常动作链 →](community-pets/claude-dafeiyu/ACTIVITY-CHAINS.md) · [全部 {count} 段动作图鉴 →](docs/ACTIONS.md)', ''])
    readme = ROOT / 'README.md'
    original = readme.read_text(encoding='utf-8')
    start = original.index('\n## 站起来') if '\n## 站起来' in original else original.index('\n## 动作一览')
    end = original.index('\n## 开始陪伴')
    readme.write_text(original[:start] + '\n' + '\n'.join(showcase) + original[end:], encoding='utf-8')
    record = {'count': len(lookup), 'showcaseSingles': sum(map(len, selections.values())) + len(office_names),
              'chains': chains, 'actions': list(lookup.values())}
    (ROOT / 'docs/media/action-index.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'PASS all {count} manifest videos covered once; {showcase_count} showcase actions; 3 featured chains.', flush=True)


if __name__ == '__main__':
    main()
