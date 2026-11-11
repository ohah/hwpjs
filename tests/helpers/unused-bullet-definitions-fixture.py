from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import re
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--input',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
original=args.input
with ZipFile(original) as z:
 data=z.read('Contents/header.xml')
 fragment=re.search(rb'<hh:bullet\b[^>]*\bid="7".*?</hh:bullet>',data).group()
 added=fragment.replace(b'id="7"',b'id="99"',1).replace('▶'.encode(),'★'.encode(),1)
 unsupported=fragment.replace(b'id="7"',b'id="100"',1).replace(b'checkable="0"',b'checkable="1"',1)
 # All declarations are unused in this document before applying the UI command.
 header=re.sub(rb'(<hh:heading\b[^>]*\btype=")BULLET("[^>]*\bidRef=")\d+("[^>]*\blevel=")\d+(")',rb'\g<1>NONE\g<2>0\g<3>0\4',data)
 header=header.replace(b'<hh:bullets itemCnt="22">',b'<hh:bullets itemCnt="24">',1)
 header=header.replace(b'</hh:bullets>',added+unsupported+b'</hh:bullets>',1)
 out=args.output
 with ZipFile(out,'w') as result:
  for item in z.infolist():result.writestr(item,header if item.filename=='Contents/header.xml' else z.read(item))
 root=ET.fromstring(header);ns={'h':'http://www.hancom.co.kr/hwpml/2011/head'}
 assert len(root.findall('.//h:bullet',ns))==24
 assert not any(e.get('type')=='BULLET' for e in root.findall('.//h:heading',ns))
 print('24 actual header declarations, zero paragraph BULLET references, unused 99 and unsupported 100')
