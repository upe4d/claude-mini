import urllib.request,base64,concurrent.futures,json,re
from pathlib import Path
urls=[f'https://chromium.googlesource.com/chromium/src/+/refs/tags/{v}/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc?format=TEXT' for v in ['156.0.8078.47','157.0.8103.38']]
def get(u):
 try:
  with urllib.request.urlopen(u,timeout=20) as q:d=q.read()
  text=base64.b64decode(d).decode('utf8'); lines=text.splitlines(); matches=[{'line':n+1,'context':'\n'.join(lines[max(0,n-7):min(len(lines),n+15)])} for n,s in enumerate(lines) if 'timezone' in s.lower() or 'trusted' in s.lower()];return {'url':u,'bytes':len(text),'matches':matches}
 except Exception as e:return {'url':u,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:r=list(p.map(get,urls))
print(json.dumps(r,ensure_ascii=False,indent=2));Path('release-macos/artifacts/timezone-trusted-source-check.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
