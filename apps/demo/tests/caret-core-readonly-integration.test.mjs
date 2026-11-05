import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectionFormatting } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import { fixture } from './caret-formatting-fixture.mjs';
for (const readonly of [false, true])
  test(
    'canonical Core caret readonly source flows to toolbar independently from writer ' + readonly,
    async () => {
      const f = await fixture({ readonly });
      try {
        const s = f.core.getEditorState(),
          o = getSelectionFormatting(s);
        assert.equal(o.size, 1500);
        assert.equal(o.bold, true);
        assert.equal(o.fontNames.hangul.name, '문서원본');
        assert.equal(o.target.startUnit, o.target.endUnit);
        assert.equal(
          o.characterAvailableReason,
          readonly ? 'SelectionNotEditable' : 'EmptyCharacterSelection',
        );
        const bridge = createFormattingBridge({ editor: f.editor, onStatus() {} });
        const p = bridge.getPresentation();
        assert.equal(p.fontSizePoints, 15);
        assert.equal(p.fontName, '문서원본');
        assert.equal(p.actions.bold.enabled, false);
        assert.equal(p.actions['set-font-size'].enabled, false);
        bridge.dispose();
      } finally {
        await f.dispose();
      }
    },
  );
