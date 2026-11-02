"""Build complete-drawing choreography; never assemble or deform individual limbs.

All poses come from imagegen sheets. Registration uses one scale per sheet and
whole-image translation. Timelines retain their chosen frame holds at 24fps.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from sprite_sheet import extract_drawings

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'community-pets/claude-dafeiyu'
SOURCE = PACK / 'sources/reference-actions'
PREVIEW = PACK / 'preview/reference-actions'
SIZE = (640, 360)
FPS = 24
NAMES = {'salute':'抱文件认真敬礼', 'breeze':'转身回眸·发梢随风'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')


def sheet(key, rows):
    drawings = extract_drawings(SOURCE / (key+'.png'), 4, rows)
    scale = 314 / max(item['image'].height for item in drawings)
    first = drawings[0]
    pixels = np.asarray(first['image'])
    brown = ((pixels[:,:,0] > pixels[:,:,1]*1.15) & (pixels[:,:,1] > pixels[:,:,2]*1.1)
             & (pixels[:,:,0] < 200) & (pixels[:,:,3] > 180))
    brown[:int(len(brown)*.75)] = False
    xs = np.where(brown)[1]
    anchor = first['box'][0] + float(np.mean(xs)) if len(xs) else first['cellCenterX']
    shift = (first['cellCenterX']-anchor)*scale
    output=[]
    folder=PREVIEW/'frames'/key
    folder.mkdir(parents=True,exist_ok=True)
    for index,item in enumerate(drawings):
        original=item['image']
        resized=original.resize((round(original.width*scale),round(original.height*scale)),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',SIZE)
        x=round(320+(item['box'][0]-item['cellCenterX'])*scale+shift)
        canvas.alpha_composite(resized,(x,345-resized.height))
        bbox=canvas.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
        assert bbox and bbox[0]>8 and bbox[1]>8 and bbox[2]<632 and bbox[3]<352,(key,index,bbox)
        path=folder/f'{index+1:02}.png'
        canvas.save(path)
        output.append(path)
    return output


def section(frames, indexes, hold=4):
    return [(frames[index-1],hold) for index in indexes]


def encode(key, timeline):
    folder=PREVIEW/key
    folder.mkdir(parents=True,exist_ok=True)
    concat=folder/'timeline.ffconcat'
    text=['ffconcat version 1.0']
    for path,hold in timeline:
        text += ["file '"+path.as_posix()+"'",f'duration {hold/FPS:.9f}']
    text += ["file '"+timeline[-1][0].as_posix()+"'"]
    concat.write_text('\n'.join(text)+'\n',encoding='utf8')
    count=sum(hold for _,hold in timeline)
    target=PACK/'animation'/(NAMES[key]+'.webm')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-v','error','-f','concat','-safe','0','-i',str(concat),
                    '-an','-vf','fps=24','-frames:v',str(count),'-c:v','libvpx-vp9','-pix_fmt','yuva420p',
                    '-auto-alt-ref','0','-b:v','0','-crf','20',str(target)],check=True)
    # Documentation previews are independently decoded from the actual delivered video.
    sys.path.insert(0,str(ROOT/'tools/release'))
    from build_release import frames as decode,make_gif
    gif=ROOT/'docs/media/reference-actions'/(key+'.gif')
    make_gif(decode(target.relative_to(PACK).as_posix()),gif)
    unique=list(dict.fromkeys(path for path,_ in timeline))
    contact=Image.new('RGB',(4*300,((len(unique)+3)//4)*360),'#eff2ee')
    try:font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
    except OSError:font=ImageFont.load_default()
    for index,path in enumerate(unique):
        frame=Image.open(path).convert('RGBA')
        sprite=frame.crop((170,12,500,352))
        sprite.thumbnail((280,320))
        xy=((index%4)*300+(300-sprite.width)//2,(index//4)*360+28)
        contact.paste(sprite,xy,sprite)
        ImageDraw.Draw(contact).text(((index%4)*300+10,(index//4)*360+5),f'{path.parent.name} / {path.stem}',fill='#364452',font=font)
    contact.save(folder/'contact.png')
    result={'id':key,'name':NAMES[key],'source':'animation/'+target.name,'frames':count,'durationSec':count/FPS,
            'uniqueDrawings':len(unique),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
            'gif':'docs/media/reference-actions/'+key+'.gif',
            'timeline':[{'sheet':p.parent.name,'frame':int(p.stem),'holdFrames':n} for p,n in timeline]}
    write_json(folder/'timeline.json',result)
    print(f'{NAMES[key]}: {count/FPS:.2f}s, {len(unique)} complete drawings, {target.stat().st_size:,} bytes',flush=True)
    return result


def main():
    PREVIEW.mkdir(parents=True,exist_ok=True)
    salute=sheet('salute',3)
    breeze=sheet('breeze-lookback',3)
    poses=section(salute,range(1,13),3)
    poses[0]=(salute[0],6)
    poses[6]=(salute[6],18)
    poses[7]=(salute[7],12)
    poses[-1]=(salute[-1],6)
    results=[encode('salute',poses)]
    wind=section(breeze,[1,2,3,4,5,6,7,8,7,6,5,4,3,2,1],6)
    wind[7]=(breeze[7],24)
    results.append(encode('breeze',wind))
    path=SOURCE/'choreography.json'
    previous=json.loads(path.read_text(encoding='utf8')) if path.exists() else {}
    results += [a for a in previous.get('actions',[]) if a['id']=='happy']
    write_json(path,{'method':'imagegen-whole-character-keyframes','fps':FPS,
        'audio':False,'actions':results})


if __name__=='__main__':main()
