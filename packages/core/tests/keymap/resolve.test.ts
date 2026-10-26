import { test, expect } from 'bun:test';
import { compileKeymap, resolveKeyboardShortcut } from '../../src/keymap/resolve.ts';
import { parseKeymapConfig, type KeymapPlatform } from '../../src/keymap/config.ts';
const config = {
  version: 1,
  bindings: [{ id: 'save', command: 'unknown.host.command', code: 'KeyS', modifiers: ['Mod'] }],
};
const event = { code: 'KeyS', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
test('Mod expands per explicit platform and every modifier matches exactly', () => {
  for (const platform of ['mac', 'windows', 'linux'] as KeymapPlatform[]) {
    const compiled = compileKeymap(config, platform),
      hit = { ...event, [platform === 'mac' ? 'metaKey' : 'ctrlKey']: true };
    expect(resolveKeyboardShortcut(compiled, hit)?.command).toBe('unknown.host.command');
    expect(resolveKeyboardShortcut(compiled, event)).toBe(null);
    for (const key of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'])
      expect(resolveKeyboardShortcut(compiled, { ...hit, [key]: !(hit as any)[key] })).toBe(null);
    expect(resolveKeyboardShortcut(compiled, { ...hit, code: 'KeyF' })).toBe(null);
  }
});
test('composition/229/repeat/AltGraph are ignored independently', () => {
  const compiled = compileKeymap(config, 'windows'),
    hit = { ...event, ctrlKey: true };
  for (const guard of [
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { altGraph: true },
  ])
    expect(resolveKeyboardShortcut(compiled, { ...hit, ...guard })).toBe(null);
  expect(
    resolveKeyboardShortcut(compiled, {
      ...hit,
      keyCode: 83,
      isComposing: false,
      repeat: false,
      altGraph: false,
    })?.id,
  ).toBe('save');
});
test('platform and enabled filters, physical code matching and literal ctrl+meta combos', () => {
  const compiled = compileKeymap(
    {
      version: 1,
      bindings: [
        { id: 'off', command: 'off', code: 'KeyS', modifiers: [], enabled: false },
        { id: 'mac', command: 'mac', code: 'KeyS', modifiers: [], platform: 'mac' },
        { id: 'both', command: 'both', code: 'KeyS', modifiers: ['Meta', 'Control'] },
      ],
    },
    'windows',
  );
  expect(compiled.bindings.length).toBe(1);
  expect(resolveKeyboardShortcut(compiled, event)).toBe(null);
  expect(resolveKeyboardShortcut(compiled, { ...event, ctrlKey: true, metaKey: true })?.id).toBe(
    'both',
  );
});
test('compiled lookup owns inputs, is frozen and rejects forged handles/platforms', () => {
  const input = structuredClone(config),
    compiled = compileKeymap(input, 'linux');
  input.bindings[0].code = 'KeyQ';
  expect(Object.isFrozen(compiled.bindings)).toBe(true);
  expect(resolveKeyboardShortcut(compiled, { ...event, ctrlKey: true })?.id).toBe('save');
  expect(() => compileKeymap(config, 'all' as KeymapPlatform)).toThrow();
  expect(() => resolveKeyboardShortcut({ ...compiled }, event)).toThrow('InvalidCompiledKeymap');
  expect(resolveKeyboardShortcut(compiled, { ...event, ctrlKey: 1 } as any)).toBe(null);
  expect(parseKeymapConfig(config).version).toBe(1);
});
test('all eight Control/Alt/Shift combinations match their one exact binding', () => {
  const compiled = compileKeymap(
    {
      version: 1,
      bindings: Array.from({ length: 8 }, (_, mask) => ({
        id: String(mask),
        command: 'generic',
        code: 'KeyX',
        modifiers: [
          ...(mask & 1 ? ['Control'] : []),
          ...(mask & 2 ? ['Alt'] : []),
          ...(mask & 4 ? ['Shift'] : []),
        ],
      })),
    },
    'linux',
  );
  for (let mask = 0; mask < 8; mask++)
    expect(
      resolveKeyboardShortcut(compiled, {
        code: 'KeyX',
        ctrlKey: !!(mask & 1),
        metaKey: false,
        altKey: !!(mask & 2),
        shiftKey: !!(mask & 4),
      })?.id,
    ).toBe(String(mask));
});

test('public keymap modules import and resolve without DOM/platform/fetch getters', () => {
  const configURL = new URL('../../src/keymap/config.ts', import.meta.url).href;
  const resolveURL = new URL('../../src/keymap/resolve.ts', import.meta.url).href;
  const script = `for(const name of ['document','window','navigator','Worker','fetch'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('UnexpectedGlobal:'+name)}});
 const {parseKeymapConfig}=await import(${JSON.stringify(configURL)});
 const {compileKeymap,resolveKeyboardShortcut}=await import(${JSON.stringify(resolveURL)});
 const compiled=compileKeymap(parseKeymapConfig({version:1,bindings:[{id:'x',command:'host.x',code:'KeyX',modifiers:[]}]}),'linux');
 const event={code:'KeyX',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,get getModifierState(){throw Error('UnexpectedDOMMethod')}};
 if(resolveKeyboardShortcut(compiled,event)?.id!=='x')throw Error('MissingShortcut');`;
  const child = Bun.spawnSync([process.execPath, '--eval', script], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(new TextDecoder().decode(child.stderr)).toBe('');
  expect(child.exitCode).toBe(0);
});
