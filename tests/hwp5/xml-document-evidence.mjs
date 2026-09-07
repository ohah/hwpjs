import assert from 'node:assert/strict';
import {xmlNamePattern,xmlReferenceExpected} from './xml-reference.mjs';
import {xmlTagEvidence} from './xml-tag-evidence.mjs';
// Independent whole-document traversal; reuses only the existing JS token oracles.
export function xmlDocumentEvidence(original,byteLength,hooks={}){
  const text=original.replace(/\r\n?/g,'\n'),stack=[];
  let at=0,root=false,events=0,elements=0,endTags=0,attributes=0,references=0,scalars=0,comments=0,cdata=0,pi=0,depth=0;
  if(/^<\?xml[ \t\n]/.test(text)){const end=text.indexOf('?>');assert.ok(end>=0);at=end+2;}
  while(at<text.length){
    events++;
    if(text.startsWith('<!--',at)){
      const end=text.indexOf('-->',at+4);assert.ok(end>=0);const body=text.slice(at+4,end);assert.ok(!body.includes('--')&&!body.endsWith('-'));comments++;at=end+3;
    }else if(text.startsWith('<![CDATA[',at)){
      assert.ok(stack.length);const end=text.indexOf(']]>',at+9);assert.ok(end>=0);scalars+=[...text.slice(at+9,end)].length;cdata++;at=end+3;
    }else if(text.startsWith('<?',at)){
      const end=text.indexOf('?>',at+2);assert.ok(end>=0);const body=text.slice(at+2,end),name=xmlNamePattern.exec(body)?.[0];assert.ok(name&&name.toLowerCase()!=='xml');assert.ok(body.length===name.length||/[ \t\n]/.test(body[name.length]));hooks.pi?.(name);pi++;at=end+2;
    }else if(text[at]==='<'){
      assert.ok(!text.startsWith('<!',at));const tag=xmlTagEvidence(text.slice(at),0);assert.equal(tag.unresolved,0);hooks.tag?.(tag);attributes+=tag.attributes;references+=tag.references;
      if(tag.kind===1){assert.equal(stack.pop(),tag.name);endTags++;}else{if(!stack.length){assert.ok(!root);root=true;}elements++;depth=Math.max(depth,stack.length+1);if(tag.kind===0)stack.push(tag.name);}
      at+=tag.units;
    }else{
      let end=text.indexOf('<',at);if(end<0)end=text.length;const body=text.slice(at,end);
      if(!stack.length)assert.ok(/^[ \t\n]*$/.test(body));
      else{let i=0;while(i<body.length){if(body[i]==='&'){const ref=xmlReferenceExpected(body.slice(i));assert.notEqual(ref.kind,3);references++;scalars++;i+=ref.token.length;}else{let next=body.indexOf('&',i);if(next<0)next=body.length;const literal=body.slice(i,next);assert.ok(!literal.includes(']]>'));scalars+=[...literal].length;i=next;}}}
      at=end;
    }
  }
  assert.ok(root&&!stack.length);
  const fields=[byteLength,[...text].length,events,elements,endTags,attributes,references,scalars,comments,cdata,pi,depth,0];
  const wire=Buffer.alloc(fields.length*4);fields.forEach((v,i)=>wire.writeUInt32LE(v,i*4));
  return {wire,characters:fields[1],events,elements,endTags,attributes,references,scalars,comments,cdata,pi,depth};
}
