"""Build market artwork from existing verified character frames; no new poses."""
from pathlib import Path
import shutil
from PIL import Image, ImageDraw, ImageFont, ImageOps
from build_release import ROOT, PACK, frames

destination = ROOT / 'dsh-pet/assets/screenshots'
destination.mkdir(parents=True, exist_ok=True)
shutil.copy2(ROOT / 'docs/media/hero.png', destination / '01-forms.png')
font_path = next(p for p in [Path('C:/Windows/Fonts/msyh.ttc'), Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')] if p.exists())
font = ImageFont.truetype(str(font_path), 22)
title_font = ImageFont.truetype(str(font_path), 32)
groups = [
    ('02-daily.png', '站立日常', ['自然走路', '点击回应-元气挥手', '撸猫', '吃白饭', '小提琴演奏', '超大伸懒腰']),
    ('03-companion.png', '托腮陪伴', ['托腮·安静陪伴', '托腮·轻摇鲸尾', '托腮·指尖拨头发', '托腮·摇头哼歌', '托腮·眯眼小憩', '托腮·轻声回应']),
    ('04-office.png', '从拿出电脑，到收起电脑', ['托腮办公·拿出并打开电脑', '托腮办公·轻敲键盘', '托腮办公·停笔想一想', '托腮办公·揉眼伸肩', '托腮办公·收起电脑', '托腮·安静陪伴']),
    ('05-new-actions.png', '接单敬礼 · 回眸 · 跳起张臂', ['抱文件认真敬礼', '转身回眸·发梢随风', '跳起后张臂']),
]
for filename, title, names in groups:
    canvas = Image.new('RGB', (1120, 100 + 310 * ((len(names) + 2) // 3)), '#f2eee7')
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 20), 'dsh-pet-claude · ' + title, font=title_font, fill='#24344c')
    for i, name in enumerate(names):
        source = ('lean-animation/' if name.startswith('托腮') else 'animation/') + name + '.webm'
        decoded = frames(source)
        frame = decoded[len(decoded)//2]
        sprite = ImageOps.contain(frame.crop(frame.getchannel('A').getbbox()), (300, 230), Image.Resampling.LANCZOS)
        x, y = 24+(i%3)*368, 90+(i//3)*310
        draw.rounded_rectangle((x, y, x+344, y+290), radius=18, fill='#fffdf9')
        canvas.paste(sprite, (x+(344-sprite.width)//2, y+10+(230-sprite.height)//2), sprite)
        label = name.replace('托腮办公·', '').replace('托腮·', '').replace('点击回应-', '')
        draw.text((x+172, y+264), label, anchor='mm', font=font, fill='#24344c')
    canvas.save(destination / filename, optimize=True)

frame = frames('animation/安静站立·眨眼呼吸.webm')[0]
bounds = frame.getchannel('A').getbbox()
head = frame.crop((bounds[0], bounds[1], bounds[2], bounds[1]+int((bounds[3]-bounds[1])*0.62)))
head = ImageOps.contain(head, (166, 166), Image.Resampling.LANCZOS)
icon = Image.new('RGBA', (180, 180), '#f2eee7')
icon.paste(head, ((180-head.width)//2, 180-head.height), head)
icon.save(ROOT / 'dsh-pet/assets/claude-icon.png', optimize=True)
print('Prepared 5 market images and a Claude icon from verified frames.')
