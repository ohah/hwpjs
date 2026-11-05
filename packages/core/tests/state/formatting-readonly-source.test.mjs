// 실제 Native DEF 자료가 아닌 명시된 source 모델의 공개 selector 회귀다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  getSelectionFormatting,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
} from '@hwpjs/core';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
async function fixture(options = {}) {
  const text = options.text ?? 'DEF';
  const messages = [];
  const content = {
    format: 'hwp5',
    paragraphAlignmentAvailable: true,
    characterPropertiesAvailable: true,
    characterTextColorAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterFontNameAvailable: true,
    characterShapes: [{ id: 99, height: 1600, bold: true, italic: true }],
    characterTextColors: [{ id: 99, color: 0xff0000 }],
    characterUnderlines: [{ id: 99, kind: 'bottom' }],
    characterStrikes: [{ id: 99, enabled: true }],
    characterFontReferences: [{ id: 99, fontIds: languages.map(() => 0) }],
    fontFaces: languages.map((language) => ({
      language,
      id: 0,
      name: language === 'latin' ? '굴림' : '명시원본',
    })),
    paragraphs: [
      {
        section: 0,
        paragraph: 19,
        text,
        editable: true,
        selectionOwner: 'section:0:body',
        paragraphShape: { alignment: 0 },
        currentReference: {
          kind: options.original ? 'original' : 'generated',
          section: 0,
          id: '1',
        },
        characterRanges: text ? [{ start: 0, end: text.length, charShapeId: 99 }] : [],
      },
    ],
  };
  options.change?.(content);
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        messages.push(m);
        return { kind: m.kind, content, meta: { application: 'unapplied', changed: false } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5', editable: !options.readonly });
  const target = createParagraphSelection(editor.getEditorState(), {
    section: 0,
    paragraph: 19,
    startUnit: options.start ?? 0,
    endUnit: options.end ?? (options.caret ? (options.start ?? 0) : text.length),
  });
  await editor.setSelection(target);
  return { editor, messages, target, content };
}
const checkKnown = (o) => {
  assert.equal(o.size, 1600);
  assert.equal(o.bold, true);
  assert.equal(o.italic, true);
  assert.equal(o.textColor, '#ff0000');
  assert.equal(o.underline, true);
  assert.equal(o.strike, true);
  assert.equal(o.fontNames.latin.name, '굴림');
};
// EditorState의 prototype getter도 실제 값으로 읽어 손상 snapshot의 선행 전제를 보존한다.
function snapshot(state, changes = {}) {
  const keys = [
    'status',
    'selection',
    'content',
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
    'token',
    'capabilities',
  ];
  const value = Object.fromEntries(keys.map((key) => [key, state[key]]));
  assert.deepEqual(getSelectionFormatting(value), getSelectionFormatting(state));
  return { ...value, ...changes };
}
const checkUnknown = (o) => {
  assert.equal(o.size, null);
  assert.equal(o.bold, null);
  assert.equal(o.italic, null);
  assert.equal(o.textColor, null);
  assert.equal(o.underline, null);
  assert.equal(o.strike, null);
  for (const value of Object.values(o.fontNames)) assert.equal(value.kind, 'unknown');
};
for (const caret of [false, true])
  test(
    (caret ? '생성caret' : '생성nonempty') + ' 원자료 관측과 Original-only writer 거부를 분리한다',
    async () => {
      const f = await fixture({ caret });
      try {
        const o = getSelectionFormatting(f.editor.getEditorState());
        checkKnown(o);
        assert.equal(o.characterAvailableReason, 'UnsupportedFormattingReference');
        assert.equal(o.fontNameAvailableReasons.latin, 'UnsupportedFormattingReference');
        assert.equal(o.target.startUnit, o.target.endUnit - (caret ? 0 : 3));
        const n = f.messages.length;
        const result = await f.editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
          target: f.target,
          properties: { bold: false },
        });
        assert.equal(result.status, 'rejected-unapplied');
        assert.equal(result.error, 'UnsupportedFormattingReference');
        assert.equal(f.messages.length, n);
      } finally {
        await f.editor.dispose();
      }
    },
  );
for (const unit of [1, 3])
  test('생성caret ' + unit + '도 기존 typingSourceSpan의 현재 scalar만 읽는다', async () => {
    const f = await fixture({ caret: true, start: unit });
    try {
      checkKnown(getSelectionFormatting(f.editor.getEditorState()));
    } finally {
      await f.editor.dispose();
    }
  });
for (const [name, options] of [
  ['빈 문단', { text: '', caret: true }],
  ['빈 span', { caret: true, change: (c) => (c.paragraphs[0].characterRanges = []) }],
  [
    '미관측 charShape ID',
    {
      caret: true,
      change: (c) => (c.paragraphs[0].characterRanges = [{ start: 0, end: 3, charShapeId: 100 }]),
    },
  ],
  [
    '모든 source capability 부재',
    {
      caret: true,
      change: (c) => {
        for (const k of [
          'characterPropertiesAvailable',
          'characterTextColorAvailable',
          'characterUnderlineAvailable',
          'characterStrikeAvailable',
          'characterFontNameAvailable',
        ])
          c[k] = false;
      },
    },
  ],
  [
    'caret 구간 coverage gap',
    {
      caret: true,
      start: 3,
      change: (c) => (c.paragraphs[0].characterRanges = [{ start: 0, end: 1, charShapeId: 99 }]),
    },
  ],
])
  test(name + '는 기본값으로 채우지 않는다', async () => {
    const f = await fixture(options);
    try {
      checkUnknown(getSelectionFormatting(f.editor.getEditorState()));
    } finally {
      await f.editor.dispose();
    }
  });
test('character shape 부재는 B/I/size null이며 독립 font 원자료를 삭제하지 않는다', async () => {
  const f = await fixture({ caret: true, change: (c) => (c.characterShapes = []) });
  try {
    const o = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(o.size, null);
    assert.equal(o.bold, null);
    assert.equal(o.italic, null);
    assert.equal(o.fontNames.latin.name, '굴림');
  } finally {
    await f.editor.dispose();
  }
});
test('font binding 부재는 unknown이며 독립 B/I/size는 유지한다', async () => {
  const f = await fixture({ caret: true, change: (c) => (c.characterFontReferences = []) });
  try {
    const o = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(o.fontNames.latin.kind, 'unknown');
    assert.equal(o.size, 1600);
    assert.equal(o.bold, true);
  } finally {
    await f.editor.dispose();
  }
});
for (const caret of [false, true])
  test('읽기전용 ' + caret + '는 값만 관측하고 writer 선행거부를 유지한다', async () => {
    const f = await fixture({ caret, readonly: true });
    try {
      const o = getSelectionFormatting(f.editor.getEditorState());
      checkKnown(o);
      assert.equal(o.characterAvailableReason, 'SelectionNotEditable');
    } finally {
      await f.editor.dispose();
    }
  });
test('clipped row는 validateSelection에서 거부하며 source를 읽지 않는다', async () => {
  const f = await fixture({ caret: true });
  try {
    const state = f.editor.getEditorState();
    const o = getSelectionFormatting(
      snapshot(state, {
        content: {
          ...state.content,
          format: state.content.format,
          paragraphs: [{ ...state.content.paragraphs[0], clipped: true }],
        },
      }),
    );
    assert.equal(o.target, null);
    assert.equal(o.characterAvailableReason, 'InvalidSelectionOwner');
    checkUnknown(o);
  } finally {
    await f.editor.dispose();
  }
});
test('stale token은 관측 전에 거부한다', async () => {
  const f = await fixture({ caret: true });
  try {
    const state = f.editor.getEditorState(),
      o = getSelectionFormatting(
        snapshot(state, {
          selection: {
            ...getSelectionFormatting(state).target,
            viewRevision: state.viewRevision + 1,
          },
        }),
      );
    assert.equal(o.target, null);
    assert.equal(o.characterAvailableReason, 'StaleTarget');
    checkUnknown(o);
  } finally {
    await f.editor.dispose();
  }
});
test('emoji scalar 뒤 caret는 기존 UTF16 전체 scalar span을 읽는다', async () => {
  const f = await fixture({ caret: true, text: '😀A', start: 2 });
  try {
    checkKnown(getSelectionFormatting(f.editor.getEditorState()));
  } finally {
    await f.editor.dispose();
  }
});
test('surrogate 내부 caret는 public selection 검증을 우회하지 않는다', async () => {
  const f = await fixture({ caret: true, text: '😀A', start: 2 });
  try {
    const state = f.editor.getEditorState(),
      o = getSelectionFormatting(
        snapshot(state, {
          selection: { ...getSelectionFormatting(state).target, startUnit: 1, endUnit: 1 },
        }),
      );
    assert.equal(o.target, null);
    assert.equal(o.characterAvailableReason, 'InvalidScalarBoundary');
    checkUnknown(o);
  } finally {
    await f.editor.dispose();
  }
});
for (const caret of [false, true])
  test('원본문단 ' + caret + ' 관측과 기존 writer reason은 유지한다', async () => {
    const f = await fixture({ original: true, caret });
    try {
      const o = getSelectionFormatting(f.editor.getEditorState());
      checkKnown(o);
      assert.equal(o.characterAvailableReason, caret ? 'EmptyCharacterSelection' : null);
    } finally {
      await f.editor.dispose();
    }
  });
test('명시false 원자료는 unknown null과 구분한다', async () => {
  const f = await fixture({
    caret: true,
    change: (c) => {
      c.characterShapes[0].bold = false;
      c.characterShapes[0].italic = false;
    },
  });
  try {
    const o = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(o.bold, false);
    assert.equal(o.italic, false);
    assert.equal(o.size, 1600);
  } finally {
    await f.editor.dispose();
  }
});
test('surrogate 내부 source run 경계는 유효한 선택 끝점만으로 승인하지 않는다', async () => {
  const f = await fixture({
    caret: true,
    text: '😀A',
    start: 2,
    change: (c) => {
      c.characterShapes.push({ id: 100, height: 1200, bold: false, italic: false });
      c.characterFontReferences.push({ id: 100, fontIds: languages.map(() => 0) });
      c.characterTextColors.push({ id: 100, color: 0xff0000 });
      c.characterUnderlines.push({ id: 100, kind: 'bottom' });
      c.characterStrikes.push({ id: 100, enabled: true });
      c.paragraphs[0].characterRanges = [
        { start: 0, end: 1, charShapeId: 99 },
        { start: 1, end: 3, charShapeId: 100 },
      ];
    },
  });
  try {
    const observed = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(observed.target.startUnit, 2);
    assert.equal(observed.characterAvailableReason, 'UnsupportedFormattingReference');
    checkUnknown(observed);
  } finally {
    await f.editor.dispose();
  }
});
for (const [label, options, key, reason] of [
  ['생성 범위', { caret: false }, 'JUSTIFY', 'UnsupportedFormattingReference'],
  [
    '생성 caret',
    { caret: true, change: (c) => (c.paragraphs[0].paragraphShape.alignment = 1) },
    'LEFT',
    'UnsupportedFormattingReference',
  ],
  [
    '읽기전용 원본',
    {
      original: true,
      readonly: true,
      change: (c) => (c.paragraphs[0].paragraphShape.alignment = 2),
    },
    'RIGHT',
    'SelectionNotEditable',
  ],
  [
    '문단쓰기 capability 부재',
    {
      original: true,
      change: (c) => {
        c.paragraphAlignmentAvailable = false;
        c.paragraphs[0].paragraphShape.alignment = 3;
      },
    },
    'CENTER',
    'FormattingCapabilityUnavailable',
  ],
])
  test('문단 정렬 ' + label + '는 원본 enum만 표시하고 writer 거부는 보존한다', async () => {
    const f = await fixture(options);
    try {
      const o = getSelectionFormatting(f.editor.getEditorState());
      assert.equal(o.align, key);
      assert.equal(o.paragraphAvailableReason, reason);
      const n = f.messages.length;
      const result = await f.editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
        target: f.target,
        alignment: 'LEFT',
      });
      assert.equal(result.status, 'rejected-unapplied');
      assert.equal(result.error, options.readonly ? 'ReadOnlyDocument' : reason);
      assert.equal(f.messages.length, n);
    } finally {
      await f.editor.dispose();
    }
  });
test('문단 정렬은 빈 문단의 문자 source span 부재와 독립이다', async () => {
  const f = await fixture({ text: '', caret: true });
  try {
    const o = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(o.bold, null);
    assert.equal(o.size, null);
    assert.equal(o.align, 'JUSTIFY');
    assert.equal(o.paragraphAvailableReason, 'UnsupportedFormattingReference');
  } finally {
    await f.editor.dispose();
  }
});
test('문단 정렬은 surrogate 내부 문자 run 오류 때문에 숨기지 않는다', async () => {
  const f = await fixture({
    text: '😀A',
    caret: true,
    start: 2,
    change: (c) => {
      c.paragraphs[0].paragraphShape.alignment = 3;
      c.paragraphs[0].characterRanges = [
        { start: 0, end: 1, charShapeId: 99 },
        { start: 1, end: 3, charShapeId: 99 },
      ];
    },
  });
  try {
    const o = getSelectionFormatting(f.editor.getEditorState());
    assert.equal(o.bold, null);
    assert.equal(o.size, null);
    assert.equal(o.align, 'CENTER');
    assert.equal(o.paragraphAvailableReason, 'UnsupportedFormattingReference');
  } finally {
    await f.editor.dispose();
  }
});
for (const [label, change] of [
  ['원본 metadata 없음', (c) => delete c.paragraphs[0].paragraphShape],
  ['알 수 없는 enum', (c) => (c.paragraphs[0].paragraphShape.alignment = 99)],
  ['문자열 enum 추정 금지', (c) => (c.paragraphs[0].paragraphShape.alignment = '1')],
])
  test('문단 정렬 ' + label + '은 null을 유지한다', async () => {
    const f = await fixture({ change });
    try {
      const o = getSelectionFormatting(f.editor.getEditorState());
      assert.equal(o.align, null);
      assert.equal(o.paragraphAvailableReason, 'UnsupportedFormattingReference');
    } finally {
      await f.editor.dispose();
    }
  });
