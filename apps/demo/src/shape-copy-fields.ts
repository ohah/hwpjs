/** Query IDs and sparse patch paths only. Values/permissions come from Core/Native. */
export type ShapeCopyField = Readonly<{
  id: string;
  label: string;
  group: 'character' | 'paragraph';
  fields: readonly string[];
}>;
const character = [
  ['size', '글자 크기'],
  ['bold', '굵게'],
  ['italic', '기울임'],
  ['textColor', '글자 색'],
  ['ratio', '장평'],
  ['charSpacing', '자간'],
  ['relativeSize', '상대 크기'],
  ['offset', '글자 위치'],
  ['underline.kind', '밑줄 위치'],
  ['underline.style', '밑줄 선 모양'],
  ['underline.color', '밑줄 색'],
  ['strike.enabled', '취소선 사용'],
  ['strike.style', '취소선 모양'],
  ['strike.color', '취소선 색'],
  ['shade', '음영'],
  ['outlineKind', '외곽선'],
  ['effects.relief', '양각·음각'],
  ['effects.script', '위·아래 첨자'],
  ['shadow.kind', '그림자 종류'],
  ['shadow.offsetX', '그림자 가로 위치'],
  ['shadow.offsetY', '그림자 세로 위치'],
  ['shadow.color', '그림자 색'],
  ['border', '글자 테두리'],
  ['background', '글자 배경'],
] as const;
const paragraph = [
  ['alignment', '정렬'],
  ['margins.left', '왼쪽 여백'],
  ['margins.right', '오른쪽 여백'],
  ['margins.indent', '들여쓰기·내어쓰기'],
  ['margins.before', '문단 위 간격'],
  ['margins.after', '문단 아래 간격'],
  ['grid', '줄 격자'],
  ['borderConnect', '테두리 연결'],
  ['border', '문단 테두리'],
  ['background', '문단 배경'],
  ['bullet', '기존 문자 글머리표'],
] as const;
export const SHAPE_COPY_FIELDS: readonly ShapeCopyField[] = Object.freeze([
  ...character.map(([key, label]) =>
    Object.freeze({
      id: 'character.' + key,
      label,
      group: 'character' as const,
      fields: Object.freeze(['character.' + key]),
    }),
  ),
  ...(['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'] as const).map(
    (language, i) =>
      Object.freeze({
        id: 'character.fonts.' + language + '.name',
        label: ['한글', '영문', '한자', '일어', '기타', '기호', '사용자'][i] + ' 글꼴 이름',
        group: 'character' as const,
        fields: Object.freeze(['character.fonts.' + language + '.name']),
      }),
  ),
  ...paragraph.map(([key, label]) =>
    Object.freeze({
      id: 'paragraph.' + key,
      label,
      group: 'paragraph' as const,
      fields: Object.freeze(['paragraph.' + key]),
    }),
  ),
  Object.freeze({
    id: 'paragraph.spacing',
    label: '줄 간격',
    group: 'paragraph' as const,
    fields: Object.freeze(['paragraph.spacing.kind', 'paragraph.spacing.value']),
  }),
]);
