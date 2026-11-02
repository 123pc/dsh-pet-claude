"""Inspect the actual TGZ; reject engine-only or incomplete market releases."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

path = Path(sys.argv[1])
with tarfile.open(path) as archive:
    names = set(archive.getnames())
    def read(name):
        return archive.extractfile('package/' + name).read()
    package = json.loads(read('package.json'))
    assert package['dsh']['bundle']['patch'] == './cordis.patch.yml'
    for name in ['lib/index.js', 'lib/client.js', 'runtime/electron-helper/shared-core.js', 'assets/claude-icon.png', 'README.md']:
        assert 'package/' + name in names, name
    manifest = json.loads(read('assets/bundled-claude/manifest.json'))
    expected = json.loads((Path(__file__).resolve().parents[2] / 'community-pets/claude-dafeiyu/manifest.json').read_text(encoding='utf8'))
    assert manifest == expected
    videos = 0
    for item in manifest['files']:
        content = read('assets/bundled-claude/' + item['source'])
        assert hashlib.sha256(content).hexdigest() == item['sha256'], item['source']
        videos += item['source'].endswith('.webm')
    assert videos == sum(item['source'].endswith('.webm') for item in expected['files'])
    expected_videos={'package/assets/bundled-claude/'+item['source'] for item in expected['files'] if item['source'].endswith('.webm')}
    actual_videos={name for name in names if name.startswith('package/assets/bundled-claude/') and name.endswith('.webm')}
    assert actual_videos==expected_videos, 'Retired or unlisted videos remain in the package'
    assert '内置角色' in read('lib/index.js').decode('utf-8')
    print(json.dumps({'version':package['version'], 'files':len(names), 'bundledVideos':videos,
                      'configs':len(manifest['files'])-videos, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
