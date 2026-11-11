import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createCfbReader } from '../../../../js/cfb.mjs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const rec = (tag, level, payload) =>
  Buffer.concat([
    word(tag | (level << 10) | ((payload.length < 4095 ? payload.length : 4095) << 20)),
    ...(payload.length < 4095 ? [] : [word(payload.length)]),
    payload,
  ]);
function records(raw) {
  const rows = [];
  for (let at = 0; at < raw.length;) {
    const start = at,
      w = raw.readUInt32LE(at);
    at += 4;
    let n = w >>> 20;
    if (n === 4095) {
      n = raw.readUInt32LE(at);
      at += 4;
    }
    rows.push({
      tag: w & 1023,
      level: (w >>> 10) & 1023,
      payload: raw.subarray(at, at + n),
      raw: raw.subarray(start, at + n),
    });
    at += n;
  }
  return rows;
}
const scalar = (key, type, value) =>
  `${key}:${type}:${type === 'wstring' ? value.length + ':' : ''}${value} `;
const set = (key, body) => `${key}:set:${body.length}:${body}`;
const forms = [
  ['tbc+', 'Check', 0],
  ['tbc+', 'Check', 0],
  ['tbr+', 'Radio A', 1],
  ['tbr+', 'Radio B', 0],
  ['tde+', 'old', null],
  ['boc+', 'combo', null],
];
export async function generateFormStateFixtures({ wasmModule, directory, options = {} }) {
  await mkdir(directory);
  const h5 = await createNewDocumentBytes(wasmModule, 'hwp5'),
    cfb = await createCfbReader(wasmModule);
  let hwp;
  try {
    cfb.parse(h5);
    const document = cfb.document(),
      header = document.nodes.find((x) => x.name === 'FileHeader'),
      section = document.nodes.find((x) => x.name === 'Section0');
    const headerView = new DataView(header.content.buffer, header.content.byteOffset);
    headerView.setUint32(32, options.version ?? 0x05000300, true);
    const compressed = (headerView.getUint32(36, true) & 1) !== 0;
    const raw = compressed ? inflateRawSync(section.content) : Buffer.from(section.content),
      source = records(raw),
      p0 = Buffer.from(source[0].payload);
    p0.writeUInt32LE(p0.readUInt32LE(0) & 0x7fffffff);
    const output = [rec(66, 0, p0), ...source.slice(1).map((x) => x.raw)];
    for (const [index, [type, text, value]] of forms.entries()) {
      const p = Buffer.from(source[0].payload);
      p.writeUInt32LE(((index === forms.length - 1 ? 0x80000000 : 0) | 9) >>> 0);
      p.writeUInt32LE(1 << 11, 4);
      p.writeUInt16LE(1, 12);
      p.writeUInt16LE(0, 14);
      p.writeUInt16LE(0, 16);
      p.writeUInt32LE(100 + index, 18);
      const token = Buffer.alloc(18);
      token.writeUInt16LE(11);
      token.writeUInt32LE(0x666f726d, 2);
      token.writeUInt16LE(11, 14);
      token.writeUInt16LE(13, 16);
      const control = Buffer.alloc(46);
      control.writeUInt32LE(0x666f726d);
      control.writeUInt32LE(1, 4);
      control.writeUInt32LE(5000, 16);
      control.writeUInt32LE(1500, 20);
      control.writeUInt32LE(200 + index, 36);
      const common = set(
        'CommonSet',
        scalar('Name', 'wstring', 'F' + index) +
          scalar('Enabled', 'bool', options.disabledIndex === index ? '0' : '1') +
          scalar('Editable', 'bool', '1') +
          scalar('Printable', 'bool', '1') +
          scalar('Command', 'wstring', ''),
      );
      const char = set(
        'CharShapeSet',
        scalar('CharShapeID', 'int', '0') +
          scalar('FollowContext', 'bool', '1') +
          scalar('AutoSize', 'bool', '0') +
          scalar('WordWrap', 'bool', '0'),
      );
      const choice =
        value === null
          ? ''
          : scalar('Caption', 'wstring', text) +
            scalar('Value', 'int', String(options.unknownStateIndex === index ? 9 : value)) +
            scalar('TriState', 'bool', '1') +
            scalar('BackStyle', 'int', '1') +
            (type === 'tbr+'
              ? scalar(
                  'RadioGroupName',
                  'wstring',
                  options.unnamedIndex === index ? '' : (options.groupName ?? 'Group A'),
                )
              : '');
      const group =
        type === 'tde+'
          ? set(
              'EditSet',
              scalar('Text', 'wstring', text) +
                scalar('ReadOnly', 'bool', options.readOnly ? '1' : '0') +
                scalar('MaxLength', 'int', '100') +
                scalar('Number', 'bool', '0') +
                scalar('MultiLine', 'bool', '0') +
                scalar('PasswordChar', 'wstring', '') +
                scalar('AlignText', 'int', '0'),
            )
          : type === 'boc+'
            ? set(
                'ComboBoxSet',
                scalar('Text', 'wstring', text) +
                  scalar('EditEnable', 'bool', '1') +
                  scalar('ListBoxRows', 'int', '5') +
                  scalar('ListBoxWidth', 'int', '1000'),
              )
            : set('ButtonSet', choice);
      const prop = Buffer.from(common + ' ' + char + ' ' + group, 'utf16le'),
        envelope = Buffer.alloc(14);
      envelope.write(type);
      envelope.write(type, 4);
      envelope.writeUInt32LE(prop.length / 2, 8);
      envelope.writeUInt16LE(prop.length / 2, 12);
      output.push(
        rec(66, 0, p),
        rec(67, 1, token),
        rec(68, 1, Buffer.alloc(8)),
        rec(71, 1, control),
        rec(91, 2, Buffer.concat([envelope, prop])),
      );
    }
    section.content = compressed ? deflateRawSync(Buffer.concat(output)) : Buffer.concat(output);
    hwp = cfb.write(document);
  } finally {
    cfb.close();
  }
  await writeFile(join(directory, 'forms.hwp'), hwp);
  await writeFile(join(directory, 'blank.hwpx'), await createNewDocumentBytes(wasmModule, 'hwpx'));
  const child = spawnSync(
    'python3',
    [
      '-B',
      fileURLToPath(new URL('./form-state-hwpx-fixture.py', import.meta.url)),
      join(directory, 'blank.hwpx'),
      join(directory, 'forms.hwpx'),
      JSON.stringify(options),
    ],
    { encoding: 'utf8' },
  );
  if (child.status !== 0) throw Error(child.stderr);
  return { hwp5: hwp, hwpx: await readFile(join(directory, 'forms.hwpx')) };
}
