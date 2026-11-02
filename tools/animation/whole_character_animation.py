"""Register whole-character drawings and encode explicitly timed alpha video.

No limb rigging, optical flow, crossfades or synthetic frame interpolation.
Frame holds are expressed in 24fps video ticks. The timeline can combine
quick airborne in-betweens, slower anticipation and a grounded finish.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
from PIL import Image
from sprite_sheet import extract_drawings

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'community-pets/claude-dafeiyu'
SOURCE = PACK / 'sources/happy-open-arms'
PREVIEW = PACK / 'preview/reference-actions'
FPS = 24
DRAWING_FPS = 12
NAMES = {'happy': '跳起后张臂'}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


def register(key, rows=4, scale_anchor=0, lifts=None):
    drawings = extract_drawings(SOURCE / (key+'.png'), 4, rows)
    assert len(drawings) == 4*rows
    # Use a neutral pose as the scale anchor for each sheet.
    # A single scale for the whole sheet retains knee compression and
    # raised hands; per-frame fitting would make the character breathe in size.
    scale = 310 / drawings[scale_anchor]['image'].height
    output = []
    folder = PREVIEW/'frames'/key
    folder.mkdir(parents=True, exist_ok=True)
    for index, item in enumerate(drawings):
        original = item['image']
        resized = original.resize((round(original.width*scale), round(original.height*scale)), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (640,360))
        # Generated sheet layout is not choreography. Register the cream
        # lower torso, rather than its arbitrary offset inside each grid cell.
        # This translates the complete drawing; limbs are never moved alone.
        pixels = np.asarray(original)
        cream = ((pixels[:,:,0]>180)&(pixels[:,:,1]>150)&(pixels[:,:,2]>110)
                 &(pixels[:,:,0]>pixels[:,:,1])&(pixels[:,:,1]>pixels[:,:,2])&(pixels[:,:,3]>180))
        cream[:int(original.height*.54)] = False
        cream[int(original.height*.64):] = False
        xs = np.where(cream)[1]
        anchor = float(np.median(xs)) if len(xs) else original.width/2
        x = round(320-anchor*scale)
        lift=0 if lifts is None else lifts[index]
        canvas.alpha_composite(resized, (x,345-lift-resized.height))
        box = canvas.getchannel('A').point(lambda a: 255 if a>128 else 0).getbbox()
        assert box and box[0]>8 and box[1]>8 and box[2]<632 and box[3]<352, (key,index,box)
        path = folder/f'{index+1:02}.png'
        canvas.save(path)
        output.append(path)
    return output


def encode(key, sheets=None, order=None, finish_key='h', revision=1, finish_hold_sec=1.25,
           timed_frames=None, drawing_fps=12):
    if timed_frames is None:
        timeline = [path for phrase in order for path in sheets[phrase]]
        finish = sheets[finish_key]
        hold=round(finish_hold_sec*DRAWING_FPS)
        timeline += finish + [finish[-1]]*hold + finish[-2::-1]
        timed_frames=[(path,2) for path in timeline]
    timeline=[path for path,_ in timed_frames]
    count=sum(hold for _,hold in timed_frames)
    target = PACK/'animation'/(NAMES[key]+'.webm')
    process = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-v','error',
        '-f','rawvideo','-pixel_format','rgba','-video_size','640x360','-framerate','24','-i','pipe:0',
        '-an','-vf','fps=24','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-cpu-used','2','-threads','4',
        '-auto-alt-ref','0','-b:v','0','-crf','20',str(target)], stdin=subprocess.PIPE)
    try:
        for path,hold in timed_frames:
            raw=Image.open(path).convert('RGBA').tobytes()
            for _ in range(hold):
                process.stdin.write(raw)
    finally:
        process.stdin.close()
    assert process.wait()==0, key
    unique = list(dict.fromkeys(timeline))
    result = {'id':key,'name':NAMES[key],'source':'animation/'+target.name,
        'revision':revision,'fps':FPS,'drawingFps':drawing_fps,'frames':count,
        'durationSec':count/FPS,'uniqueDrawings':len(unique),
        'finishHoldSec':finish_hold_sec,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'gif':'docs/media/reference-actions/'+key+'.gif',
        'timeline':[{'sheet':p.parent.name,'frame':int(p.stem),'holdFrames':n} for p,n in timed_frames]}
    write(PREVIEW/key/'timeline.json', result)
    sys.path.insert(0, str(ROOT/'tools/release'))
    from build_release import frames,make_gif
    make_gif(frames(result['source'],drawing_fps), ROOT/result['gif'],fps=drawing_fps)
    # Fixed-size audit sheet, showing every newly drawn frame exactly once.
    contact = Image.new('RGB',(8*240,((len(unique)+7)//8)*270),'#eff2ee')
    for index,path in enumerate(unique):
        image = Image.open(path).convert('RGBA')
        image = image.crop((150,12,500,352))
        image.thumbnail((230,260))
        contact.paste(image,((index%8)*240+(240-image.width)//2,(index//8)*270+5),image)
    contact.save(PREVIEW/key/'contact.png')
    print(f'{NAMES[key]}: {result["durationSec"]:.2f}s, {len(unique)} drawings, up to {drawing_fps} drawing fps / 24 encoded fps',flush=True)
    return result
