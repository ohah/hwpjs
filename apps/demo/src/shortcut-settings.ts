import {DEFAULT_KEYMAP,mergeKeymap,parseKeymapConfig,resolveShortcutLabel,compileKeymap,resolveKeyboardShortcut,type KeymapConfig,type KeymapPlatform} from '@hwpjs/core';
import {createKeyboardShortcuts} from '@hwpjs/vanilla';
import {DEMO_COMMAND_REGISTRY} from './command-support.ts';
import type {DemoAction,DemoCommand} from './shell-contract.ts';
export function mountShortcutSettings(options:{root:HTMLElement;surface:HTMLElement;available:(command:DemoCommand)=>boolean;
 execute:(action:DemoAction)=>void|Promise<void>;nativePaste?:()=>boolean;onStatus:(message:string)=>void;config?:unknown;locale?:string}){
 const doc=options.root.ownerDocument,nav=doc.defaultView?.navigator;
 const platform:KeymapPlatform=/Mac|iPhone|iPad/.test(nav?.platform??'')?'mac':/Win/.test(nav?.platform??'')?'windows':'linux';
 const known=(config:KeymapConfig)=>{for(const b of config.bindings)if(!Object.hasOwn(DEMO_COMMAND_REGISTRY,b.command)||['set-font-size','set-zoom'].includes(b.command))throw Error('UnknownShortcutCommand:'+b.command);return config;};
 let config=known(options.config===undefined?DEFAULT_KEYMAP:mergeKeymap(DEFAULT_KEYMAP,parseKeymapConfig(options.config))),closed=false,generation=0;
 const keyboard=createKeyboardShortcuts({root:options.surface,config,platform,fallback:DEFAULT_KEYMAP,nativePaste:options.nativePaste,
  isAvailable:command=>options.available(command as DemoCommand),execute:command=>options.execute({command:command as Exclude<DemoCommand,'set-font-size'|'set-zoom'>}),
  onUnavailable:command=>options.onStatus(`${DEMO_COMMAND_REGISTRY[command as DemoCommand].label}: 현재 실행할 수 없습니다.`),onError:error=>options.onStatus(error instanceof Error?error.message:String(error))});
 const details=doc.createElement('details');details.dataset.role='shortcut-settings';
 const summary=doc.createElement('summary');summary.textContent='단축키 설정';
 const locale=doc.createElement('select');locale.dataset.role='shortcut-locale';locale.setAttribute('aria-label','단축키 표시 언어');
 for(const [value,text] of [['ko','한국어'],['en','English']]){const o=doc.createElement('option');o.value=value;o.textContent=text;locale.append(o);}locale.value=options.locale?.startsWith('en')?'en':'ko';
 const label=doc.createElement('label'),file=doc.createElement('input');file.type='file';file.accept='.json,application/json';file.dataset.role='shortcut-config';label.append('JSON 설정 가져오기 ',file);
 const list=doc.createElement('ul');list.dataset.role='shortcut-bindings';
 const render=()=>{if(closed)return;list.replaceChildren();for(const b of compileKeymap(config,platform).bindings){const li=doc.createElement('li');li.dataset.bindingId=b.id;const modifiers=b.modifiers.map(m=>m==='Mod'?(platform==='mac'?'⌘':'Ctrl'):m);li.textContent=`${resolveShortcutLabel(config,b,locale.value)} — ${[...modifiers,b.code.replace(/^Key/,'')].join('+')}`;list.append(li);}};
 const report=(e:unknown)=>{if(!closed)options.onStatus(e instanceof Error?e.message:String(e));};
 const commit=(input:unknown)=>{if(closed)throw Error('ShortcutSettingsDisposed');const next=known(mergeKeymap(DEFAULT_KEYMAP,parseKeymapConfig(input)));keyboard.setConfig(next);config=next;render();};
 // Every explicit replacement fences previous asynchronous imports, even on validation failure.
 const apply=(input:unknown)=>{if(closed)throw Error('ShortcutSettingsDisposed');generation++;commit(input);};
 const changed=async()=>{if(closed)return;const current=++generation,selected=file.files?.[0];if(!selected)return;
  try{if(selected.size>262144)throw Error('ShortcutConfigTooLarge');const text=await selected.text();if(closed||generation!==current)return;commit(JSON.parse(text));options.onStatus('단축키 설정을 적용했습니다.');}catch(error){if(!closed&&generation===current)report(error);}finally{if(!closed&&generation===current)file.value='';}};
 file.addEventListener('change',changed);locale.addEventListener('change',render);
 const reset=doc.createElement('button');reset.type='button';reset.dataset.role='shortcut-reset';reset.textContent='기본값 복원';reset.onclick=()=>{if(closed)return;apply(DEFAULT_KEYMAP);};
 const download=doc.createElement('button');download.type='button';download.textContent='JSON 내보내기';download.dataset.role='shortcut-export';download.onclick=()=>{
  if(closed)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'})),link=doc.createElement('a');link.href=url;link.download='hwpjs-keymap.json';details.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 details.append(summary,locale,label,reset,download,list);options.root.append(details);render();
 const resolveCommand=(event:KeyboardEvent)=>resolveKeyboardShortcut(compileKeymap(config,platform),{code:event.code,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey,isComposing:event.isComposing,keyCode:event.keyCode,repeat:false,altGraph:event.getModifierState?.('AltGraph')===true})?.command;
 return {resolveCommand,getConfig:()=>config,setConfig:apply,dispose(){if(closed)return;closed=true;generation++;keyboard.dispose();reset.onclick=null;download.onclick=null;file.removeEventListener('change',changed);locale.removeEventListener('change',render);details.remove();}};
}
