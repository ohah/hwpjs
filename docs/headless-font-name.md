# 헤드리스 글꼴 이름 명령

`SET_CHARACTER_FONT_NAME_COMMAND`는 `{ target, language, name }`을 받습니다. 이 명령을 포함해 빌드한 동일 core 모듈의 editor/command/selection facade를 함께 사용합니다. 기존 ID를 JS에서 새로 만들지 않으며 지정한 언어의 글꼴 참조만 Native가 생성·재사용합니다.

```ts
import { createParagraphSelection, SET_CHARACTER_FONT_NAME_COMMAND, getSelectionFormatting } from '@ohah/hwpjs';
const target = createParagraphSelection(editor.getEditorState(), {
  section: 0, paragraph: 15, startUnit: 0, endUnit: 1,
});
await editor.dispatchCommand(SET_CHARACTER_FONT_NAME_COMMAND, {
  target, language: 'latin', name: 'Example Font',
});
const value = getSelectionFormatting(editor.getEditorState()).fontNames.latin;
if (value.kind === 'single') console.log(value.name);
```

`language`는 필수이고 `hangul`, `latin`, `hanja`, `japanese`, `other`, `symbol`, `user` 중 하나입니다. 이름은 trim/정규화하지 않습니다. 빈 문자열과 잘못된 UTF-16은 거부하며 UTF-8 4096바이트까지 허용합니다. `mixed`라는 실제 이름은 `{ kind: 'single', name: 'mixed' }`, 혼합 범위는 `{ kind: 'mixed' }`, 관측 불가는 `{ kind: 'unknown' }`으로 구분합니다. 유효한 원 ID의 `name: null`은 리소스 바인딩 부재와 다릅니다. `fontNameAvailableReasons`는 언어별 적용 불가 사유를 반환합니다.

선택 token/owner/UTF-16 경계/읽기 전용/Native capability 검증은 기존 경로를 재사용합니다. 비어 있지 않은 원본 범위만 지원하며 미지원 생성 셀을 임의 owner로 우회하지 않습니다. stale target은 새 selection facade로 다시 얻어야 합니다. 글꼴 변경은 기존 이력·저장 모델을 사용합니다.

## 명시 정규 테스트

Bun에서 두 파일만 실행합니다. 기존 committed Noori H5/HX fixture 두 개만 소비하며 생성 바이너리나 verification 경로를 테스트 내부에서 추측하지 않습니다.

```sh
HWPJS_TEST_WASM=/absolute/path/compatible.wasm \
bun test ./packages/core/tests/commands/character-font-name.test.ts \
  ./packages/core/tests/integration/character-font-name.test.ts --timeout 60000
```

명시 WASM 검증 기대는 pure22+실 Runtime6=28 pass, skip0입니다. 환경변수 미설정의 일반 source-only 실행에서는 Native6개가 명시 skip되며 실제 Native 성공이 아닙니다. WASM이 지정됐으나 경로/모듈/ABI가 잘못되면 실패하고 skip로 대체하지 않습니다. 독립 Chrome Worker 검증과 공개 packed 소비자는 이 정규 unit 결과와 별도입니다.

글꼴 리소스는 언어+ID Map과 charshape 참조 Map을 호출당 각각 한 번 구성합니다. source/리소스/span의 기존 선형 순회는 남으며 전체 편집기 복잡도를 증명하는 API가 아닙니다.

RN root의 기존 문서 형식 판별도 TextEncoder가 필요합니다. Native Canvas의 명시 `installNativeTextPlatform`은 host UTF-8 서비스를 연결하지만 core가 자동 설치하지 않습니다. 새 명령은 codec 없는 host에서 `FontNameEncodingUnavailable`로 거부하고 DOM/polyfill을 추가하지 않습니다. noDOM import, 웹 direct/Worker 성공을 RN 실기기 실행으로 확대하지 않습니다.
