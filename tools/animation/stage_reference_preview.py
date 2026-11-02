"""Stage only the three reviewable clips; never expose the project tree."""
from pathlib import Path
import json
import shutil

ROOT=Path(__file__).resolve().parents[2]
PACK=ROOT/'community-pets/claude-dafeiyu'


def main():
    action=json.loads((PACK/'sources/happy-open-arms/choreography.json').read_text(encoding='utf8'))['actions'][0]
    html=(Path(__file__).parent/'reference-actions.template.html').read_text(encoding='utf8')
    for key,value in {'DURATION':f'{action["durationSec"]:.2f}','COUNT':str(action['uniqueDrawings']),
                      'SOURCE':action['source'],'SHA':action['sha256'][:12]}.items():
        html=html.replace('__'+key+'__',value)
    output=PACK/'preview/reference-actions.html'
    output.write_text(html,encoding='utf8')
    stage=ROOT/'.tools/reference-actions-site'
    (stage/'preview').mkdir(parents=True,exist_ok=True)
    (stage/'animation').mkdir(parents=True,exist_ok=True)
    shutil.copy2(output,stage/'preview/reference-actions.html')
    pose=action['poster']
    poster=PACK/'preview/reference-actions/frames'/pose['sheet']/f'{pose["frame"]:02}.png'
    shutil.copy2(poster,PACK/'preview/happy-open-arms-poster.png')
    shutil.copy2(poster,stage/'preview/happy-open-arms-poster.png')
    for name in ['抱文件认真敬礼','转身回眸·发梢随风',action['name']]:
        shutil.copy2(PACK/'animation'/(name+'.webm'),stage/'animation'/(name+'.webm'))
    print('Staged only salute, breeze and the happy open-arms gesture; all new dances withdrawn.')


if __name__=='__main__':main()
