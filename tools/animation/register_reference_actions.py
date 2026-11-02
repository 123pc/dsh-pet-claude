"""Register reviewed new clips without re-encoding or replacing the 119 existing videos."""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[2]
PACK=ROOT/'community-pets/claude-dafeiyu'


def write(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')


def main():
    created=[a for a in json.loads((PACK/'sources/reference-actions/choreography.json').read_text(encoding='utf8'))['actions'] if a['id'] in ['salute','breeze','happy']]
    config_path=PACK/'claude-dafeiyu-config.json'
    config=json.loads(config_path.read_text(encoding='utf8'))
    anim=config['animations']
    names={item['id']:item['name'] for item in created}
    category={'id':'新动作','weight':1,'actions':list(names.values())}
    anim['categories']=[c for c in anim['categories'] if c['id']!='新动作']+[category]
    anim['workSequence']={'enter':names['salute'],'loops':['工作状态-忙碌点按','工作状态-思考冒泡'],
                          'exit':anim['idle'][0],'introOnly':True,'enterText':'收到任务，马上开始！'}
    new_chains=[
        {'id':'happy-open-arms','label':'开心啦，跳起张臂','weight':.5,'steps':[{'name':names['happy']}]},
        {'id':'breeze-lookback','label':'吹吹风，回头看看','weight':1,'steps':[{'name':names['breeze']},{'name':'悠闲哼歌'}]},
    ]
    ids={c['id'] for c in new_chains}|{'dance-groove','dance-overhead'}
    anim['ambient']['chains']=[c for c in anim['ambient']['chains'] if c['id'] not in ids]+new_chains
    write(config_path,config)
    manifest_path=PACK/'manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf8'))
    removed={'animation/元气摆步舞·完整篇.webm','animation/绕臂踏步舞·完整篇.webm','animation/舒展摆臂勾腿舞·完整篇.webm','animation/开心张臂欢呼.webm'}
    manifest['files']=[row for row in manifest['files'] if row['source'] not in removed]
    # Preserve the existing order: existing README GIF numbers must remain stable.
    for row in manifest['files']:
        if row['source']==config_path.name:
            row['sha256']=hashlib.sha256(config_path.read_bytes()).hexdigest()
            # 0.7.2 官方动作定义；仅动画仍保持原样的旧配置可以自动升级。
            row['previousAnimationsSha256']=['25694696cc8b401dda371565c105efb3e75da452d304d0ebb1dda74ab4aed65b']
    existing={r['source'] for r in manifest['files']}
    for action in created:
        assert hashlib.sha256((PACK/action['source']).read_bytes()).hexdigest()==action['sha256']
        if action['source'] not in existing:
            manifest['files'].append({'source':action['source'],
                'target':action['source'].replace('animation/','claude-dafeiyu-animation/',1),'sha256':action['sha256']})
        else:
            next(r for r in manifest['files'] if r['source']==action['source'])['sha256']=action['sha256']
    manifest['version']='0.8.0-reference-actions'
    write(manifest_path,manifest)
    print(f'Registered {len(created)} new actions and task greeting; retained all 119 existing videos.')


if __name__=='__main__':main()
