"""Explicit Native evidence input only; no product imports or implicit fixtures."""
from pathlib import Path
import argparse,json
import hwpx_oracle as oracle

def check(directory):
    results=[]
    for mode in ('new7','reset-character','reset-paragraph','reset-all'):
        case='hwpx-'+mode;path=directory/case;read=lambda name:(path/name).read_bytes()
        metadata=json.loads(read('metadata.json'));oracle.require(metadata['format']=='hwpx','wrong evidence format')
        command=metadata['command']
        if mode!='new7':oracle.require(command['patch']=={'reset':{'basis':'paragraph-style','scope':mode.removeprefix('reset-')}},'case reset command mismatch')
        result=oracle.verify(read('source'),read('edited'),command)
        oracle.require(read('restored')==read('source'),'restored source bytes mismatch')
        oracle.require(read('redone')==read('edited'),'redo edited bytes mismatch')
        oracle.require(read('noop')==read('edited'),'noop edited bytes mismatch')
        results.append({'case':case,**result,'restoredExact':True,'redoExact':True,'noopExact':True})
    return {'pass':len(results),'cases':results}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--evidence-dir',type=Path,required=True);args=parser.parse_args()
    oracle.require(args.evidence_dir.is_absolute(),'evidence directory must be absolute')
    print(json.dumps(check(args.evidence_dir),ensure_ascii=False,sort_keys=True))
