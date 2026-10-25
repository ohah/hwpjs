import {test,expect} from 'bun:test';
import {DEFAULT_KEYMAP,compileKeymap,resolveKeyboardShortcut,mergeKeymap,resolveShortcutLabel} from '../../src/index.ts';
for(const platform of ['mac','windows','linux'] as const)test(`default JSON exports consistent ${platform} bindings and localized overrides`,()=>{
 const compiled=compileKeymap(DEFAULT_KEYMAP,platform),primary={ctrlKey:platform!=='mac',metaKey:platform==='mac',altKey:false,shiftKey:false};
 for(const [code,command] of [['KeyS','save'],['KeyZ','undo'],['KeyF','find'],['KeyB','bold']])expect(resolveKeyboardShortcut(compiled,{...primary,code})?.command).toBe(command);
 expect(resolveKeyboardShortcut(compiled,{...primary,code:'KeyZ',shiftKey:true})?.command).toBe('redo');
 expect(resolveKeyboardShortcut(compiled,{...primary,code:'KeyH',shiftKey:platform==='mac'})?.command).toBe('replace');
 const custom=mergeKeymap(DEFAULT_KEYMAP,{version:1,bindings:[{id:'bold',command:'bold',code:'KeyB',modifiers:['Mod'],enabled:false}],messages:{en:{'command.find':'Look up'}}});
 expect(resolveKeyboardShortcut(compileKeymap(custom,platform),{...primary,code:'KeyB'})).toBeNull();
 const find=custom.bindings.find(b=>b.id==='find')!;expect(resolveShortcutLabel(custom,find,'en-US')).toBe('Look up');expect(resolveShortcutLabel(DEFAULT_KEYMAP,find,'en-US')).toBe('Find');
});
