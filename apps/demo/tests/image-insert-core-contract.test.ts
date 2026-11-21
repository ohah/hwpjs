import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../../packages/core/src/state/editor-state.ts';
import {
  INSERT_IMAGE_COMMAND,
  captureImageInsertPayload,
  imageInsertMessage,
} from '../../../packages/core/src/commands/image-insert.ts';
import { createImageInsertPort } from '../src/image-insert-port.ts';
for (const text of ['', '\u0002\u0002TEXT'])
  test('실제 Core 그림 명령과 Native 요청 DTO 연결 ' + text.length, async () => {
    const token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
    };
    const state = new EditorState({
      ...token,
      status: 'ready',
      stateVersion: 8,
      nativeHistoryRevision: 4,
      nativeHistoryStats: { protocolVersion: 2 } as any,
      content: {
        format: 'hwpx',
        imageInsertionAvailable: true,
        inlineObjectPlacementVersion: 1,
        paragraphs: [
          { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
        ],
      },
    });
    const target = {
      ...token,
      coordinateSpace: 'inline-object',
      format: 'hwpx',
      address: {
        section: 0,
        paragraph: 1,
        unit: text.length,
        expected_text: text,
        owner: { kind: 'body', binding: { session: 's7', revision: 4, serial: '8' } },
      },
    };
    const messages: any[] = [];
    const editor: any = {
      getEditorState: () => state,
      registerStateListener: () => () => {},
      getInlineObjectInsertTarget: async () => target,
      dispatchCommand: async (command: any, payload: any) => {
        assert.equal(command, INSERT_IMAGE_COMMAND);
        messages.push(imageInsertMessage(captureImageInsertPayload(payload), state));
        return { status: 'committed-with-snapshot' };
      },
    };
    const port = createImageInsertPort(editor, { INSERT_IMAGE_COMMAND }, () => ({
      state,
      selector: { section: 0, paragraph: 1 },
      unit: text.length,
      expected_text: text,
      current: () => true,
    }));
    const capture = await port.capture();
    await port.insert(capture, {
      imageBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      width: 7200,
      height: 3600,
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].kind, 'insert-image');
    assert.equal(messages[0].request.target.expected_text, text);
    assert.equal(messages[0].request.target.unit, text.length);
    assert.equal(messages[0].request.width, 7200);
    assert.equal(messages[0].request.height, 3600);
    await assert.rejects(
      port.insert(capture, {
        imageBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        width: 7200,
        height: 3600,
      }),
      /Stale/,
    );
    assert.equal(messages.length, 1);
  });
