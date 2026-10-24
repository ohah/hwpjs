// Own-source read-only survey. Uses existing independent CFB oracle and Python stdlib only.
// Run from repository root: nice -n 19 mise exec -- node tools/fixture-background-color-survey.mjs
import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join, relative, extname, basename} from 'node:path';
import {inspect, records} from '../tests/hwp5/style-preservation/text-record-oracle.mjs';
import {borderFillSourceOracle} from '../tests/hwp5/border-fill-source-oracle.mjs';
const root = 'legacy/rust/crates/hwp-core/tests/fixtures';
const out = 'zig-out/verification/color-pair-survey';
mkdirSync(out, {recursive:true});
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
function walk(p) {return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):e.isFile()?[join(p,e.name)]:[]);}
const inputs = walk(root).filter(p=>/^\.hwpx?$/i.test(extname(p))).sort();
const groups = new Map();
for(const p of inputs){const key=basename(p,extname(p)).toLowerCase(); if(!groups.has(key))groups.set(key,{hwp:[],hwpx:[]});groups.get(key)[extname(p).slice(1).toLowerCase()].push(p);}
const before = Object.fromEntries(inputs.map(p=>[p,hash(p)]));
const py = String.raw`
import sys,json,zipfile,hashlib,xml.etree.ElementTree as E
local=lambda e:e.tag.split('}')[-1]
with zipfile.ZipFile(sys.argv[1]) as z:
 h=E.fromstring(z.read('Contents/header.xml'))
 resources=[]
 for b in h.iter():
  if local(b)!='borderFill':continue
  brushes=[dict(n.attrib) for n in b.iter() if local(n)=='winBrush']
  resources.append({'id':b.get('id'),'ordinal':len(resources)+1,'brushes':brushes,'sourceXml':E.tostring(b,encoding='unicode')})
 cells=[]
 for path in sorted(z.namelist()):
  if not (path.startswith('Contents/section') and path.endswith('.xml')):continue
  s=E.fromstring(z.read(path))
  for ti,t in enumerate(n for n in s.iter() if local(n)=='tbl'):
   # Each table owns only its direct tr/tc descendants, excluding nested tables.
   for tr in (n for n in t if local(n)=='tr'):
    for c in (n for n in tr if local(n)=='tc'):
     span=next((n.attrib for n in c if local(n)=='cellSpan'),{})
     addr=next((n.attrib for n in c if local(n)=='cellAddr'),{})
     def owntext(n):
      if local(n)=='tbl':return ''
      if local(n)=='t':return ''.join(n.itertext())
      return ''.join(owntext(k) for k in n)
     cells.append({'span':dict(span),'text':owntext(c),'section':path,'tableOrdinal':ti,'address':dict(addr),'borderFillIDRef':c.get('borderFillIDRef')})
 previews=[{'path':n,'bytes':len(z.read(n)),'sha256':hashlib.sha256(z.read(n)).hexdigest()} for n in z.namelist() if n.lower().startswith('preview/')]
 print(json.dumps({'resources':resources,'cells':cells,'previews':previews}))
`;
const hex = n=>'#'+(n&0xffffff).toString(16).padStart(6,'0').toUpperCase();
const swap = n=> ((n&255)<<16)|(n&0xff00)|((n>>>16)&255);
const chromatic = n=> n!==0xffffffff && (((n>>>16)&255)!==((n>>>8)&255)||((n>>>8)&255)!==(n&255));
const normalize = s=> typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s)?s.toUpperCase():null;

// Absolute tags: CTRL_HEADER=71, LIST_HEADER=72, TABLE=77 (BEGIN=16).
// Own decoder: no imports of product table/list/cell parser. Layout is selected
// independently by HWP grid invariants, never by HWPX colors/IDs/text.
function hwpCellOracle(bytes, resources) {
 const doc=inspect(bytes), tables=[];
 const textOf=b=>{let text='';for(let at=0;at+1<b.length;){const u=b.readUInt16LE(at);if(u>=1&&u<=23&&u!==10&&u!==13){at+=16;continue;}at+=2;if(u===10||u===13)text+='\n';else if(u>=32)text+=String.fromCharCode(u);}return text;};
 for(const section of doc.sections){
  const rs=records(section.bytes), nodes=[], stack=[];
  for(const [index,r] of rs.entries()){
   while(stack.length&&nodes[stack.at(-1)].record.level>=r.level)stack.pop();
   const node={record:r,index,parent:stack.at(-1)??null,children:[]};
   if(node.parent!==null)nodes[node.parent].children.push(index);
   nodes.push(node);stack.push(index);
  }
  let ordinal=0;
  for(const owner of nodes){
   const r=owner.record;
   if(r.tag!==71||r.payload.length<4||r.payload.readUInt32LE(0)!==0x74626c20)continue;
   const table={section:section.path,tableOrdinal:ordinal++,controlRecordIndex:owner.index,versionRaw:'0x'+doc.streams.get('FileHeader').readUInt32LE(32).toString(16),candidates:[]};
   tables.push(table);
   const markers=owner.children.filter(i=>nodes[i].record.tag===77);
   if(markers.length!==1){table.unresolved='Expected one direct TABLE marker';continue;}
   const mi=markers[0], b=nodes[mi].record.payload;
   if(b.length<18){table.unresolved='Short TABLE';continue;}
   const rows=b.readUInt16LE(4),cols=b.readUInt16LE(6);
   table.rows=rows;table.columns=cols;
   if(!rows||!cols||rows*cols>1000000||b.length<20+rows*2){table.unresolved='Invalid grid limits';continue;}
   const rowSizes=Array.from({length:rows},(_,i)=>b.readUInt16LE(18+i*2));
   table.rowSizes=rowSizes;
   const lists=owner.children.filter(i=>i>mi&&nodes[i].record.tag===72);
   table.captionListRecordIndices=owner.children.filter(i=>i<mi&&nodes[i].record.tag===72);
   for(const headSize of [6,8]){
    const candidate={layout:headSize===6?'spec6':'observed8',headerSize:headSize,valid:false,errors:[],cells:[]};table.candidates.push(candidate);
    const occupancy=new Set(),starts=Array(rows).fill(0);
    for(const index of lists){
     const node=nodes[index],p=node.record.payload;
     // PARA_HEADER records are following direct siblings, not children of LIST_HEADER.
     const pos=owner.children.indexOf(index),nextList=owner.children.slice(pos+1).find(i=>nodes[i].record.tag===72)??Infinity;
     const paragraphNodes=owner.children.slice(pos+1).filter(i=>i<nextList&&nodes[i].record.tag===66);
     if(paragraphNodes.length!==p.readUInt16LE(0))candidate.errors.push(`Paragraph count differs at ${index}`);
     if(p.length<headSize+26){candidate.errors.push(`Short cell at ${index}`);continue;}
     const col=p.readUInt16LE(headSize),row=p.readUInt16LE(headSize+2),cs=p.readUInt16LE(headSize+4),rs=p.readUInt16LE(headSize+6),id=p.readUInt16LE(headSize+24);
     const cell={recordIndex:index,recordLevel:node.record.level,payloadHex:p.toString('hex'),column:col,row,columnSpan:cs,rowSpan:rs,width:p.readUInt32LE(headSize+8),height:p.readUInt32LE(headSize+12),borderFillId:id,text:paragraphNodes.map(i=>nodes[i].children.filter(j=>nodes[j].record.tag===67).map(j=>textOf(nodes[j].record.payload)).join('')).join('\n'),resource:resources.find(r=>r.id===id)??null};
     candidate.cells.push(cell);
     if(!cs||!rs||col+cs>cols||row+rs>rows||!cell.resource){candidate.errors.push(`Invalid geometry/resource at ${index}`);continue;}
     starts[row]++;
     for(let y=row;y<row+rs;y++)for(let x=col;x<col+cs;x++){const key=y*cols+x;if(occupancy.has(key))candidate.errors.push(`Overlap at ${key}`);occupancy.add(key);}
    }
    if(occupancy.size!==rows*cols)candidate.errors.push('Incomplete grid');
    if(starts.some((v,i)=>v!==rowSizes[i]))candidate.errors.push('Row Size differs from starting-cell count');
    candidate.valid=candidate.errors.length===0;
   }
   const valid=table.candidates.filter(c=>c.valid);
   if(valid.length===1){table.selectedLayout=valid[0].layout;table.cells=valid[0].cells;}else table.unresolved=`${valid.length} valid layouts; refusing ambiguity`;
  }
 }
 return {tables};
}
const textKey=s=>s.normalize('NFC').replace(/\s+/gu,'');
function compareActualCells(pair){
 const results=[];
 for(const table of pair.hwpCellInventory.tables){
  if(!table.cells)continue;
  const sectionNumber=Number(table.section.match(/Section(\d+)$/)?.[1]);
  const targets=pair.hwpxInventory.cells.filter(c=>Number(c.section.match(/section(\d+)\.xml$/)?.[1])===sectionNumber&&c.tableOrdinal===table.tableOrdinal);
  const sameGrid=targets.length===table.cells.length&&table.cells.every(c=>targets.filter(x=>Number(x.address.colAddr)===c.column&&Number(x.address.rowAddr)===c.row&&Number(x.span.colSpan)===c.columnSpan&&Number(x.span.rowSpan)===c.rowSpan).length===1);
  const sameText=sameGrid&&table.cells.every(c=>textKey(c.text)===textKey(targets.find(x=>Number(x.address.colAddr)===c.column&&Number(x.address.rowAddr)===c.row).text));
  table.crossFormatValidation={sameGrid,sameText,hwpxCellCount:targets.length};
  for(const c of table.cells){
   const n=c.resource?.pattern?.background;
   if(n===undefined||!chromatic(n))continue;
   const matching=targets.filter(x=>Number(x.address.colAddr)===c.column&&Number(x.address.rowAddr)===c.row);
   const x=matching.length===1?matching[0]:null;
   const resource=x?pair.hwpxInventory.resources.find(r=>Number(r.id)===Number(x.borderFillIDRef)):null;
   const colors=resource?.brushes.map(b=>normalize(b.faceColor)).filter(Boolean)??[];
   const validated=sameGrid&&sameText&&Boolean(textKey(c.text));
   results.push({section:table.section,tableOrdinal:table.tableOrdinal,row:c.row,column:c.column,layout:table.selectedLayout,hwpCellRecord:c.recordIndex,hwpText:c.text,hwpxText:x?.text??null,hwpBorderFillId:c.borderFillId,hwpxBorderFillId:x?.borderFillIDRef??null,rawUnsigned:n,rawHex:hex(n),rgbSwapped:hex(swap(n)),hwpxFaceColors:colors,sameGrid,sameTableText:sameText,cellTextEqual:x?textKey(c.text)===textKey(x.text):false,validated,scope:validated?'Entire table grid/spans/text equal plus nonempty cell text; structural correspondence, no conversion-provenance/pixel claim':'Unresolved correspondence; candidate only',rawMatch:validated&&colors.includes(hex(n)),swappedMatch:validated&&colors.includes(hex(swap(n)))});
  }
 }
 return results;
}

const pairs=[];
for(const [name,g] of groups){
 if(!g.hwp.length||!g.hwpx.length)continue;
 for(const hwp of g.hwp)for(const hwpx of g.hwpx){
  const pair={name,hwp,hwpx,scope:'Resource inventories only; ordinal/id correspondence does not establish corresponding actual cells. HWPX references resolved within its own file only.'};
  try {pair.hwpResources=borderFillSourceOracle(readFileSync(hwp));}catch(e){pair.hwpError=e.stack;}
  const p=spawnSync('python3',['-B','-c',py,hwpx],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(p.status===0){Object.assign(pair,{hwpx:hwpx,hwpxInventory:JSON.parse(p.stdout)});}else pair.hwpxError=p.stderr||String(p.error);
  pair.comparisons=[];
  if(pair.hwpResources&&pair.hwpxInventory){
   for(const r of pair.hwpResources){
    if(!r.pattern)continue;
    const x=pair.hwpxInventory.resources.find(x=>Number(x.id)===r.id);
    const byOrdinal=pair.hwpxInventory.resources[r.id-1];
    const n=r.pattern.background;
    const colors=x?.brushes.map(b=>normalize(b.faceColor)).filter(Boolean)??[];
    pair.comparisons.push({hwpId:r.id,hwpRecordIndex:r.record_index,fillFlags:r.fill_flags,patternKind:r.pattern.kind,rawUnsigned:n,raw32:'0x'+n.toString(16).padStart(8,'0'),rawHex:hex(n),rgbSwapped:hex(swap(n)),chromatic:chromatic(n),sentinel:n===0xffffffff,hwpxRawColorResourceIds:pair.hwpxInventory.resources.filter(q=>q.brushes.some(b=>normalize(b.faceColor)===hex(n))).map(q=>q.id),hwpxSwappedColorResourceIds:pair.hwpxInventory.resources.filter(q=>q.brushes.some(b=>normalize(b.faceColor)===hex(swap(n)))).map(q=>q.id),hwpxSameId:x??null,hwpxSameOrdinal:byOrdinal??null,rawMatch:n!==0xffffffff&&colors.includes(hex(n)),swappedMatch:n!==0xffffffff&&colors.includes(hex(swap(n))),hwpxReferencingCellCount:pair.hwpxInventory.cells.filter(c=>Number(c.borderFillIDRef)===r.id).length});
   }
   pair.hwpxChromatic=pair.hwpxInventory.resources.some(r=>r.brushes.some(b=>{const c=normalize(b.faceColor);return c&&chromatic(parseInt(c.slice(1),16));}));
  }
  if(['noori','borderfill','chart','sample-5017','table-bug'].includes(name)&&pair.hwpResources&&pair.hwpxInventory){
   try{pair.hwpCellInventory=hwpCellOracle(readFileSync(hwp),pair.hwpResources);pair.actualCellComparisons=compareActualCells(pair);}catch(e){pair.hwpCellError=e.stack;}
  }
  pairs.push(pair);
 }
}
const counts={inputFiles:inputs.length,pairedBasenames:new Set(pairs.map(p=>p.name)).size,pairCombinations:pairs.length,extractionErrors:pairs.filter(p=>p.hwpError||p.hwpxError).length};
for(const [key,predicate] of Object.entries({hwpChromatic:p=>p.comparisons.some(c=>c.chromatic),eitherChromatic:p=>p.hwpxChromatic||p.comparisons.some(c=>c.chromatic),chromaticRawMatch:p=>p.comparisons.some(c=>c.chromatic&&c.rawMatch),chromaticSwappedMatch:p=>p.comparisons.some(c=>c.chromatic&&c.swappedMatch),chromaticNeither:p=>p.comparisons.some(c=>c.chromatic&&!c.rawMatch&&!c.swappedMatch)}))counts[key]=pairs.filter(predicate).length;
counts.unpairedFiles=[...groups.values()].filter(g=>!g.hwp.length||!g.hwpx.length).reduce((n,g)=>n+g.hwp.length+g.hwpx.length,0);
counts.chromaticComparableResources=pairs.flatMap(p=>p.comparisons).filter(c=>c.chromatic&&c.hwpxSameId?.brushes.some(b=>normalize(b.faceColor))).length;
counts.chromaticResources=pairs.flatMap(p=>p.comparisons).filter(c=>c.chromatic).length;
counts.chromaticRawMatchingResources=pairs.flatMap(p=>p.comparisons).filter(c=>c.chromatic&&c.rawMatch).length;
counts.chromaticSwappedMatchingResources=pairs.flatMap(p=>p.comparisons).filter(c=>c.chromatic&&c.swappedMatch).length;
const actualCells=pairs.flatMap(p=>(p.actualCellComparisons??[]).map(c=>({name:p.name,...c})));
writeFileSync(join(out,'actual-cells.json'),JSON.stringify({method:'Independent record-level table ownership and unique HWP-only 6/8-byte grid validation; cross-format full-table span/address/text checks. Nonempty cell text required for validated comparisons.',pairs:pairs.filter(p=>p.hwpCellInventory||p.hwpCellError).map(p=>({name:p.name,hwpCellError:p.hwpCellError,inventory:p.hwpCellInventory,comparisons:p.actualCellComparisons})),counts:{chromaticCells:actualCells.length,validated:actualCells.filter(c=>c.validated).length,rawMatches:actualCells.filter(c=>c.rawMatch).length,swappedMatches:actualCells.filter(c=>c.swappedMatch).length}},null,2)+'\n');
const cellLines=['# Actual cell comparisons','', '| File | table | row,col | HWP ID | HWPX ID | raw | swapped | XML faceColor | validated | text |','|---|---:|---|---:|---:|---|---|---|---|---|',...actualCells.map(c=>`| ${c.name} | ${c.tableOrdinal} | ${c.row},${c.column} | ${c.hwpBorderFillId} | ${c.hwpxBorderFillId} | ${c.rawHex} | ${c.rgbSwapped} | ${c.hwpxFaceColors.join(',')} | ${c.validated} | ${c.hwpText.replace(/\s+/g,' ').replaceAll('|','/')} |`)];
writeFileSync(join(out,'actual-cells.md'),cellLines.join('\n')+'\n');

const after=Object.fromEntries(inputs.map(p=>[p,hash(p)]));
const unchanged=inputs.every(p=>before[p]===after[p]);
const targetTables=pairs.flatMap(p=>p.hwpCellInventory?.tables??[]);
const layoutCounts=Object.fromEntries(['spec6','observed8'].map(layout=>[layout,targetTables.filter(t=>t.selectedLayout===layout).length]));
const cellCounts={chromaticCells:actualCells.length,validated:actualCells.filter(c=>c.validated).length,rawMatches:actualCells.filter(c=>c.rawMatch).length,swappedMatches:actualCells.filter(c=>c.swappedMatch).length};
const blankCandidates=actualCells.filter(c=>!c.validated&&!textKey(c.hwpText)&&c.sameGrid&&c.sameTableText&&c.hwpxFaceColors.includes(c.rawHex));
const nooriExamples=actualCells.filter(c=>c.name==='noori').map(c=>`Fixture-specific noori (current extraction): ${c.section} table${c.tableOrdinal} row${c.row} col${c.column} text ${JSON.stringify(c.hwpText.trim())}: HWP BorderFill${c.hwpBorderFillId} raw ${c.rawHex}, HWPX BorderFill${c.hwpxBorderFillId} faceColor ${c.hwpxFaceColors.join(', ')||'absent'}, swapped ${c.rgbSwapped}; validated=${c.validated}.`);
const resourceUsage=pairs.filter(p=>p.hwpCellInventory).map(p=>{
 const ids=p.comparisons.filter(c=>c.chromatic).map(c=>c.hwpId);
 const tables=p.hwpCellInventory.tables;
 const hwpRefs=tables.flatMap(t=>t.cells??[]).filter(c=>ids.includes(c.borderFillId)).length;
 const hwpxRefs=p.hwpxInventory.cells.filter(c=>ids.includes(Number(c.borderFillIDRef))).length;
 return `${p.name}: chromatic HWP resource IDs [${ids.join(', ')}]; direct HWP cell references ${hwpRefs}, HWPX same-ID cell references ${hwpxRefs}; unresolved HWP tables ${tables.filter(t=>!t.cells).length}. Same-ID reference totals alone do not establish correspondence.`;
});
const failedPairs=pairs.filter(p=>p.hwpError||p.hwpxError).map(p=>p.name);
const cellErrors=pairs.filter(p=>p.hwpCellError).map(p=>p.name);

const cellFindingLines=['# Independent actual-cell findings','',
 'This supersedes the resource-only correspondence limitation in findings.md for the specifically validated cells below. No product parser, WASM, or new native build was used.',
 '', 'Absolute record tags are CTRL_HEADER 71, LIST_HEADER 72, TABLE 77. Record-level stack establishes control ownership. Direct LIST_HEADERs after the table marker own following sibling PARA_HEADERs until the next list; their paragraph count is checked. Captions before the marker are excluded. Nested table ordinals follow preorder per section.',
 '', 'Table 80 is decoded at explicit candidate list-header sizes 6 and 8: column+0, row+2, spans+4/+6, width+8, height+12, borderFillId+24. Version raw is retained, but cannot select layout by itself (list_header.zig contract). Candidates must independently satisfy resource references, positive spans, bounds, exact complete non-overlapping grid, starting-cell Row Size counts and paragraph counts. Zero cell height is retained, not rejected. ' + `Target tables inventoried: ${targetTables.length}; unique layouts: ${JSON.stringify(layoutCounts)}; unresolved: ${targetTables.filter(t=>!t.selectedLayout).length}; cell extraction errors: ${cellErrors.join(', ')||'none'}. Rejected candidate diagnostics and original cell payload hex are retained.`,
 '', 'HWPX section number/table preorder/address/spans are compared independently; all table text must match after NFC and whitespace removal. Text extraction excludes nested tables on both sides and skips HWP embedded controls. A chromatic cell additionally needs nonempty matching text to be called validated. These are source structural correspondences, not conversion provenance or display/pixel equivalence.',
 '', '| Pair | tables resolved | chromatic cells | text-validated raw matches | swapped matches |',
 '|---|---:|---:|---:|---:|',
 ...pairs.filter(p=>p.hwpCellInventory).map(p=>`| ${p.name} | ${p.hwpCellInventory.tables.filter(t=>t.cells).length}/${p.hwpCellInventory.tables.length} | ${p.actualCellComparisons.length} | ${p.actualCellComparisons.filter(c=>c.rawMatch).length} | ${p.actualCellComparisons.filter(c=>c.swappedMatch).length} |`),
 '', `Chromatic cell candidates: ${cellCounts.chromaticCells}; nonempty-text validated: ${cellCounts.validated}; validated raw matches: ${cellCounts.rawMatches}; validated swapped matches: ${cellCounts.swappedMatches}. Blank-text candidates with equal full grids/text and raw-matching colors: ${blankCandidates.length}, excluded from validated totals.`,
 '', ...resourceUsage,
 '', ...(nooriExamples.length?nooriExamples:['No chromatic noori cell examples available in current extraction; previous fixture examples are not asserted.']),
 '', 'Examples in actual-cells.md include every chromatic candidate with coordinate, text, IDs and color values; actual-cells.json includes every decoded table cell and rejected layout diagnostics. survey.json includes independent HWPX cell inventory and header source XML.',
 '', 'Main-investigation context supplied by user: noori HWPX thumbnail looks yellow while XML is cyan; official Hancom Type.h and Util.cpp SetRgb establish XML RGB. This survey does not independently certify those visual/external-source observations. Preview entries and SHA256 are inventoried in survey.json so main can link exact embedded assets. Actual product color inventory/pixels remain main investigation work.',
 '', `${inputs.length} fixture SHA256 comparisons: ${inputs.filter(p=>before[p]===after[p]).length} unchanged, ${inputs.filter(p=>before[p]!==after[p]).length} changed. Independent pair extraction failures (${failedPairs.length}): ${failedPairs.join(', ')||'none'}. Survey exit status: ${!unchanged||counts.extractionErrors?1:0} (1 for changed input hashes or pair extraction failures). Syntax checking is a separate command, not asserted by this generated report. Survey uses existing independent oracle and Python stdlib; no product parser, WASM, native build, or new dependency is invoked.`];
writeFileSync(join(out,'actual-cell-findings.md'),cellFindingLines.join('\n')+'\n');

const report={generated:new Date().toISOString(),method:'Independent existing HWP5 CFB/zlib record oracle; Python stdlib ZIP/ElementTree for HWPX. Same-basename is a candidate pair, not conversion provenance proof. No product parser or WASM. Chromatic means R,G,B are not all equal; R=B colors cannot distinguish swapping.',scope:'All HWP/HWPX files recursively under '+root,counts,inputHashesUnchanged:unchanged,hashes:{before,after},duplicatesWithinCorpus:[...groups].filter(([,g])=>g.hwp.length>1||g.hwpx.length>1).map(([name,files])=>({name,...files})),pairs};
writeFileSync(join(out,'survey.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# Fixture background color pair survey','',JSON.stringify(counts,null,2),'',`Input SHA256 unchanged: ${unchanged}`,'','Resource inventories only: IDs/ordinals do not prove actual-cell correspondence. HWPX cell references are available in survey.json. No pixel/display or conversion provenance claim.','', '| File | HWP ID | raw COLORREF | raw hex | R/B swapped | HWPX same-ID faceColor | match | HWPX cells using ID |','|---|---:|---|---|---|---|---|---:|'];
for(const p of pairs)for(const c of p.comparisons.filter(c=>c.chromatic))lines.push(`| ${p.name} | ${c.hwpId} | ${c.raw32} | ${c.rawHex} | ${c.rgbSwapped} | ${c.hwpxSameId?.brushes.map(b=>b.faceColor).join(', ')??'missing'} | ${c.rawMatch?'raw ':''}${c.swappedMatch?'swapped':''}${!c.rawMatch&&!c.swappedMatch?'neither':''} | ${c.hwpxReferencingCellCount} |`);
lines.push('','## Enumeration','',...pairs.map(p=>`- ${p.hwp} + ${p.hwpx}${p.hwpError||p.hwpxError?' [EXTRACTION ERROR]':''}`));
writeFileSync(join(out,'summary.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({counts,inputHashesUnchanged:unchanged,evidence:out},null,2));
if(!unchanged||counts.extractionErrors)process.exitCode=1;
