"""Independent CFB proof of default and pending-size empty insertion. stdlib only."""
from pathlib import Path
import importlib.util,json,struct,sys
spec=importlib.util.spec_from_file_location('cfb',Path(__file__).with_name('paragraph-bullet-definition-oracle.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
require=c.require
U=lambda b,o=0:struct.unpack_from('<I',b,o)[0]
H=lambda b,o=0:struct.unpack_from('<H',b,o)[0]
def verify(before,after,text,height):
 left,right=c.Compound(before),c.Compound(after)
 require(left.metadata==right.metadata,'CFB metadata changed')
 require(left.streams.keys()==right.streams.keys(),'Stream inventory changed')
 for n in left.streams:
  if n not in ['/DocInfo','/BodyText/Section0']:require(left.streams[n]==right.streams[n],'Non-target stream changed')
 old_info,new_info=left.records('/DocInfo'),right.records('/DocInfo')
 old_shapes=[r['payload']for r in old_info if r['tag']==21];new_shapes=[r['payload']for r in new_info if r['tag']==21]
 require(old_shapes==new_shapes[:len(old_shapes)],'Original character declaration changed')
 added=len(new_shapes)-len(old_shapes);require(added in [0,1],'Unexpected declaration count')
 if height==1000:require(added==0,'Default typing created a shape')
 else:
  require(added==1,'Pending typing did not create one shape')
  expected=bytearray(old_shapes[1]);struct.pack_into('<i',expected,42,height)
  require(bytes(expected)==new_shapes[-1],'Wrong pending declaration or height')
 def info(rows,new):
  output=[];index=0
  for row in rows:
   data=bytearray(row['payload'])
   if row['tag']==21:
    if new and index>=len(old_shapes):index+=1;continue
    index+=1
   if row['tag']==17 and new:struct.pack_into('<I',data,9*4,U(data,9*4)-added)
   output.append((row['tag'],row['level'],bytes(data)))
  return output
 require(info(old_info,False)==info(new_info,True),'Non-target DocInfo changed')
 old=left.records('/BodyText/Section0');new=right.records('/BodyText/Section0')
 def groups(rows):
  out=[]
  for row in rows:
   if row['tag']==66:out.append([])
   require(bool(out),'Record before paragraph header');out[-1].append(row)
  return out
 og,ng=groups(old),groups(new);require(len(og)==len(ng),'Paragraph count changed')
 require(U(og[4][0]['payload'])&0x7fffffff==1,'Original is not known empty')
 require(not any(r['tag']==67 for r in og[4]),'Original unexpectedly has text')
 units=len(text.encode('utf-16le'))//2
 selected=ng[4];payload=[r['payload']for r in selected if r['tag']==67];require(payload==[(text+'\r').encode('utf-16le')],'Wrong inserted text')
 require(U(selected[0]['payload'])&0x7fffffff==units+1,'Wrong character count')
 spans=[r['payload']for r in selected if r['tag']==68];require(len(spans)==1 and len(spans[0])%8==0,'Malformed character runs')
 runs=[struct.unpack_from('<II',spans[0],i)for i in range(0,len(spans[0]),8)]
 require(runs and runs[0][0]==0 and H(selected[0]['payload'],12)==len(runs),'Missing declared first run')
 require(all(i==0 or runs[i-1][0]<r[0] for i,r in enumerate(runs)),'Overlapping runs')
 require(all(r[0]<=units+1 and r[1]<len(new_shapes) for r in runs),'Dangling run')
 require(struct.unpack_from('<i',new_shapes[runs[0][1]],42)[0]==height,'Wrong inserted text shape height')
 old_run=[r['payload']for r in og[4]if r['tag']==68];require(len(old_run)==1,'Missing original declaration')
 def normalized(groups,new):
  out=[]
  for i,rows in enumerate(groups):
   for row in rows:
    if row['tag']==69:continue
    data=bytearray(row['payload'])
    if row['tag']==66:data[16:18]=b'\0\0'
    if i==4:
     if row['tag']==67:continue
     if row['tag']==68:data=bytearray(old_run[0])
     if row['tag']==66 and new:
      struct.pack_into('<I',data,0,(U(data)&0x80000000)|1)
      struct.pack_into('<H',data,12,H(og[4][0]['payload'],12))
    out.append((row['tag'],row['level'],bytes(data)))
  return out
 require(normalized(og,False)==normalized(ng,True),'Non-target paragraph/formatting changed')
 return {'verified':True,'paragraph':4,'height':height,'text':text,'declaredShapeAdd':added,'nonTarget':'exact except stale line caches'}
if __name__=='__main__':
 require(len(sys.argv)==5,'Expected before after text height')
 print(json.dumps(verify(sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]))))
