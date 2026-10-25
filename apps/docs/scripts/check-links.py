from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import os,json,datetime,re,sys
root=Path(__file__).resolve().parents[1]
build=root/'doc_build'
base=os.environ.get('HWPJS_DOCS_BASE','/docs/')
if not re.fullmatch(r'/(?:[A-Za-z0-9_-]+/)*',base):raise RuntimeError('잘못된 base')
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.ids=set();self.refs=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.add(a['id'])
  if tag=='a' and 'name' in a:self.ids.add(a['name'])
  for key in ('href','src','poster'):
   if a.get(key):self.refs.append((tag,key,a[key]))
files=list(build.rglob('*.html'))
if not files:raise RuntimeError('먼저 문서 사이트를 빌드하세요.')
pages={p:Page(p.read_text()) for p in files}
errors=[];externals=set();checked=0
from posixpath import normpath,dirname

def resolve_ref(source,ref):
 parsed=urlsplit(ref)
 if parsed.scheme or parsed.netloc:
  if parsed.scheme in ('http','https'):externals.add(ref)
  return None,None
 # A URL with only a fragment refers to the actual HTML file, independent of cleanUrls.
 if not parsed.path:return source,unquote(parsed.fragment)
 source_rel=source.relative_to(build).as_posix()
 # SSG may emit either foo.html or foo/index.html for clean URL /foo.
 route=source_rel[:-5] if source_rel.endswith('.html') else source_rel
 if route=='index':route=''
 if route.endswith('/index'):route=route[:-5]
 current=base+route
 target=unquote(parsed.path)
 if not target.startswith('/'):
  target=normpath(dirname(current)+'/'+target)
 if not target.startswith(base):
  errors.append({'source':source_rel,'url':ref,'reason':'base 밖 내부 경로'});return None,None
 rel=target[len(base):]
 candidate=build/rel
 options=[candidate,candidate.with_suffix(candidate.suffix+'.html'),candidate/'index.html']
 if not rel:options=[build/'index.html']
 dest=next((x for x in options if x.is_file()),None)
 if not dest:errors.append({'source':source_rel,'url':ref,'reason':'대상 파일 없음'})
 return dest,unquote(parsed.fragment)
for source,page in pages.items():
 for tag,key,ref in page.refs:
  dest,fragment=resolve_ref(source,ref);checked+=1
  if dest and fragment and dest.suffix=='.html':
   parsed=pages.get(dest)
   if parsed is None:parsed=Page(dest.read_text())
   if fragment not in parsed.ids:
    errors.append({'source':source.relative_to(build).as_posix(),'url':ref,'reason':'앵커 없음'})
# CSS assets are checked relative to their emitted location, without page clean URL conversion.
for source in build.rglob('*.css'):
 for ref in re.findall(r'url\(\s*[\"\']?([^\"\')\s]+)',source.read_text()):
  if ref.startswith(('data:','#','http:','https:','//')):continue
  target=(build/unquote(ref[len(base):])) if ref.startswith(base) else source.parent/unquote(ref)
  if not target.is_file():errors.append({'source':str(source.relative_to(build)),'url':ref,'reason':'CSS asset 없음'})
  checked+=1
# Required compatibility downloads must exist and be reachable from each guide.
for ext,guide in [('hwp','demo'),('hwpx','demo-hwpx')]:
 sample=build/'demo'/('noori.'+ext)
 if not sample.is_file() or sample.stat().st_size==0:errors.append({'sample':str(sample),'reason':'필수 다운로드 누락'})
 page=pages.get(build/'guide'/(guide+'.html'))
 expected=base+'demo/noori.'+ext
 if page is None or not any(key=='href' and ref==expected for tag,key,ref in page.refs):
  errors.append({'guide':guide,'url':expected,'reason':'필수 다운로드 링크 누락'})
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':base,'htmlPages':len(pages),'checkedReferences':checked,'errors':errors,'externalURLsNotFetched':sorted(externals),'scope':'생성 HTML 전체의 href/src/poster·앵커 및 CSS url 정적 검증; 서버/E2E와 외부 URL 가용성은 제외'}
(root/'verification').mkdir(exist_ok=True)
(root/'verification'/('links-'+base.strip('/').replace('/','-')+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
if errors:
 print(json.dumps(errors,ensure_ascii=False,indent=2));sys.exit(1)
print(f'정적 링크 검증 통과: base={base}, HTML {len(pages)}개, 참조 {checked}개, 끊어진 경로/앵커 0개')
