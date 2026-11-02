"""Whole-character sheet extraction and registration; no anatomy or prop compositing."""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SIZE=(640,360)


def extract_drawings(path, cols=None, rows=None):
    """Find connected figures globally, preserving complete ahoges crossing nominal cell lines.

    Small detached props are assigned by their center to the same sheet cell. This is
    segmentation of complete illustrations, never assembly of limbs from different poses.
    """
    sheet=Image.open(path).convert('RGBA')
    if sheet.getchannel('A').getextrema()[0]!=0: raise ValueError(f'No alpha: {path}')
    w,h=sheet.size
    small=sheet.getchannel('A').resize((w//2,h//2),Image.Resampling.BILINEAR)
    sw,sh=small.size
    mask=bytearray((np.asarray(small)>128).astype(np.uint8).tobytes())
    components=[]
    membership=np.zeros((sh,sw),dtype=np.int32)
    for seed in np.flatnonzero(np.frombuffer(mask,dtype=np.uint8)):
        seed=int(seed)
        if not mask[seed]: continue
        queue=deque([seed]);mask[seed]=0
        count=0;sx=0;sy=0;left=sw;top=sh;right=0;bottom=0;pixels=[]
        while queue:
            i=queue.popleft();y,x=divmod(i,sw)
            count+=1;sx+=x;sy+=y
            pixels.append(i)
            left=min(left,x);top=min(top,y);right=max(right,x);bottom=max(bottom,y)
            for j in (i-1 if x else -1,i+1 if x+1<sw else -1,i-sw if y else -1,i+sw if y+1<sh else -1):
                if j>=0 and mask[j]: mask[j]=0;queue.append(j)
        if count<8: continue  # isolated export noise, not a meaningful drawing/prop
        area=(right-left+1)*(bottom-top+1)
        if ((bottom-top<=2 and right-left>sw*.1) or
                (right-left<=2 and bottom-top>sh*.1)):
            continue  # disconnected thin layout dividers, never anatomy or held props
        if (right-left>sw*.8 or bottom-top>sh*.8) and count/max(1,area)<.015:
            continue  # isolated sheet divider lines, never part of the character
        components.append((left*2,top*2,min(w,(right+1)*2),min(h,(bottom+1)*2),count,sx/count,sy/count,len(components)+1))
        membership.flat[pixels]=len(components)
    if cols is None or rows is None:
        main=sorted(components,key=lambda part:part[4],reverse=True)[:4]
        if len(main)<4:raise ValueError(f'Four separate figures required: {path}')
        cols,rows=(2,2) if max(p[6] for p in main)-min(p[6] for p in main)>sh*.28 else (4,1)
    regions=[[] for _ in range(cols*rows)]
    for part in components:
        col=min(cols-1,int(part[5]*cols/sw));row=min(rows-1,int(part[6]*rows/sh))
        regions[row*cols+col].append(part)
    drawings=[]
    for index,parts in enumerate(regions):
        if not parts or max(p[4] for p in parts)<1000: raise ValueError(f'Empty figure {index}: {path}')
        box=(max(0,min(p[0] for p in parts)-3),max(0,min(p[1] for p in parts)-3),
             min(w,max(p[2] for p in parts)+3),min(h,max(p[3] for p in parts)+3))
        # A bounding rectangle can overlap the neighbouring drawing on a tightly
        # spaced sheet. Keep only this figure's connected components, including
        # its own disconnected props; never import a neighbour's hair or tail.
        keep=np.isin(membership,[p[7] for p in parts]).astype(np.uint8)*255
        matte=Image.fromarray(keep).resize((w,h),Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(5))
        isolated=sheet.copy();isolated.putalpha(ImageChops.multiply(sheet.getchannel('A'),matte))
        drawings.append({'image':isolated.crop(box),'box':box,'cellCenterX':(index%cols+.5)*w/cols})
    return drawings
