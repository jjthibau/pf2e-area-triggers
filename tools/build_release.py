from pathlib import Path
import argparse,zipfile,json,hashlib
root=Path(__file__).resolve().parents[1]
names=['module.json','scripts/main.js','scripts/engine.js','scripts/sources.js','scripts/profiles.js','scripts/catalog.js','scripts/geometry.js','styles/areas.css','README.md','LICENSE']
parser=argparse.ArgumentParser();parser.add_argument('--tag');args=parser.parse_args()
m=json.loads((root/'module.json').read_text(encoding='utf-8'))
if args.tag is not None and args.tag!='v'+m['version']:raise SystemExit('Release tag must match module version.')
out=root/'dist';out.mkdir(exist_ok=True)
with zipfile.ZipFile(out/'module.zip','w',zipfile.ZIP_DEFLATED)as z:
 for n in names:
  entry=zipfile.ZipInfo(n,(2026,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;z.writestr(entry,(root/n).read_bytes())
(out/'build.json').write_text(json.dumps({'id':m['id'],'version':m['version'],'sha256':hashlib.sha256((out/'module.zip').read_bytes()).hexdigest(),'files':{n:hashlib.sha256((root/n).read_bytes()).hexdigest()for n in names}},indent=2),encoding='utf-8')
(out/'module.json').write_bytes((root/'module.json').read_bytes())
(out/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((out/n).read_bytes()).hexdigest()}  {n}\n'for n in ['module.json','module.zip']),encoding='utf-8')
(out/'RELEASE_NOTES.md').write_text(f"PF2e Area Triggers {m['version']}\n\nNative aura and spell-area save, damage, healing and reminder prompts. Combat-only automation with GM hazard activation, native Region geometry and vertical source following. No Aura Forge dependency.\n\nTested on Foundry14.369 / PF2e8.6.0. See README for supported scope.\n\nInstall manifest: {m['manifest']}\n",encoding='utf-8')
print('Built explicit ten-file runtime archive and installable release assets.')
