import hashlib,json,re,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'module.json').read_text(encoding='utf-8'));p=json.loads((root/'package.json').read_text(encoding='utf-8'))
files=['module.json','scripts/main.js','scripts/engine.js','scripts/sources.js','scripts/profiles.js','scripts/catalog.js','scripts/geometry.js','styles/areas.css','README.md','LICENSE']
assert m['id']==p['name']=='pf2e-area-triggers' and m['version']==p['version']
assert m['manifest']==m['url']+'/releases/latest/download/module.json'
assert m['download']==m['url']+'/releases/download/v'+m['version']+'/module.zip'
assert m['license']=='LICENSE' and not m.get('packs')
assert (root/'dist/module.json').read_bytes()==(root/'module.json').read_bytes()
with zipfile.ZipFile(root/'dist/module.zip')as z:
 assert sorted(z.namelist())==sorted(files) and z.testzip()is None
 for name in files:
  data=z.read(name);assert data==(root/name).read_bytes(),name
  assert not re.search(r'C:[/\\]codex|\.cloudapp\.azure\.com|/data/maintenance|FOUNDRY_ADMIN_KEY|session=|Area-local-only',data.decode('utf-8')),name
for line in (root/'dist/SHA256SUMS').read_text(encoding='utf-8').splitlines():
 digest,name=line.split('  ',1);assert digest==hashlib.sha256((root/'dist'/name).read_bytes()).hexdigest()
print('Manifest, ten-file allowlist, source parity, privacy boundaries and checksums verified.')
