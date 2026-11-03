"""Export the public interface to /software for the existing static hosting."""
from pathlib import Path
import argparse
import shutil
import hashlib
from urllib.parse import urlparse

REPO=Path(__file__).resolve().parents[1]
SOURCE=REPO/'drx-software/Web'
TARGET=REPO/'software'
FILES=('index.html','app.js','style.css','i18n.js','translations.json')
EXAMPLES=('preview.json','cortetodo-example.gcode','drx-positions-template.xlsx')

def build(api_base):
    parsed=urlparse(api_base)
    if parsed.scheme!='https' or not parsed.hostname or parsed.path not in ('','/') or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Use an HTTPS API origin without a path or credentials.')
    TARGET.mkdir(exist_ok=True)
    for name in FILES:
        shutil.copy2(SOURCE/'software'/name,TARGET/name)
    (TARGET/'assets').mkdir(exist_ok=True)
    for name in ('drx-logo.png','DRX_favicon_x.png'):
        shutil.copy2(SOURCE/'img'/name,TARGET/'assets'/name)
    html=(TARGET/'index.html').read_text(encoding='utf8').replace('../img/','assets/')
    style_revision=hashlib.sha256((SOURCE/'software/style.css').read_bytes()).hexdigest()[:12]
    html=html.replace('href="style.css"',f'href="style.css?v={style_revision}"')
    # A refreshed page must use the current playback code and language dictionary.
    for script in ('config.js','i18n.js','app.js'):
        script_source=SOURCE/'software'/script
        if script=='config.js':
            continue  # This generated file only identifies the existing API origin.
        revision=hashlib.sha256(script_source.read_bytes()).hexdigest()[:12]
        html=html.replace(f'src="{script}"',f'src="{script}?v={revision}"')
    # Local-only administration links never appear on the public website.
    import re
    html=re.sub(r'<a id="connection-settings"[^>]*>.*?</a>','',html)
    html=re.sub(r'<a id="connect-delivery"[^>]*>.*?</a>','',html)
    (TARGET/'index.html').write_text(html,encoding='utf8')
    script=(TARGET/'app.js').read_text(encoding='utf8')
    script=script.replace('$("connection-settings").hidden = result.setupAvailable !== true;','').replace('$("connect-delivery").hidden = result.setupAvailable !== true;','')
    (TARGET/'app.js').write_text(script,encoding='utf8')
    import json
    (TARGET/'config.js').write_text('window.DRX_CONFIG = Object.freeze('+json.dumps({'apiBase':api_base.rstrip('/')})+');\n',encoding='utf8')
    (TARGET/'examples').mkdir(exist_ok=True)
    for name in EXAMPLES:
        shutil.copy2(SOURCE/'software/examples'/name,TARGET/'examples'/name)
    (REPO/'.nojekyll').write_text('',encoding='utf8')
    assert 'n8n' not in (TARGET/'index.html').read_text(encoding='utf8').lower()
    assert '/setup' not in (TARGET/'index.html').read_text(encoding='utf8')
    print('Exported public DRX Software to /software. Landing unchanged.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--api-base',required=True)
    build(parser.parse_args().api_base)
