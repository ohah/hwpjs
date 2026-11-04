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

## 현재 선택의 글꼴·크기 표시

단일 Core 원본 선택의 주 라벨은 한글 partition의 문서 원본 글꼴 이름이며 tooltip은 기존7언어 partition을 각각 표시한다. mixed·unknown·명시 name null·빈 이름은 구분하고 시스템 fallback 글꼴이나 첫 ID를 원본값으로 만들지 않는다. 크기는 원본1/100pt 정수/100으로 표시하며 숫자·혼합·unknown·unavailable을 구분한다. 혼합/미관측에10pt나0을 채우지 않는다.

readonly 또는 SelectionNotEditable로 쓰기 selector가 size null을 돌려줄 때만 이미 검증한 같은 target·정확 문단1개에 canonical characterSizeState 읽기를 적용한다. UTF-16/span·clipped 검사를 유지하고 쓰기 reason/capability와 Native admission은 바꾸지 않는다. caret-only와 다문단 font/size 관측은 지원 범위가 아니며 Surface 범위를 단일 target으로 위조하지 않는다. 스타일 이름은 SDK05에서 미노출이므로 이름 미관측으로 표시한다. 기존 reset.style은 자원 가용성만 반환하며 Native 내부 정보 부재로 단정하지 않는다. [정적 근거](../zig-out/verification/sdk05-style-name-static-path-audit-r2/HANDOFF.json)를 따른다.

[source0a3f 통제17](../zig-out/verification/formatting-observation-display-r1/SOURCE-GATE-01.json)과 [Native readonly7552](../zig-out/verification/formatting-observation-display-r1/ACTUAL-SDK05-RANGE-OBSERVATIONS.json)는 별도 증거다. 실제 SDK05/d849 H5/HX에서 단일 범위 mixed·부분 범위1500/1300과 원본 한글명 휴먼명조를 읽었고 편집0·입력/WASM 불변을 확인했다. 실제 before 세션과 동일하다고 승계하지 않는다.

[H5 50% b646 QA](../zig-out/verification/font-size-display-browser-zoom50-r3/FINAL-HANDOFF.json)와 [HX 50% 85f355 QA](../zig-out/verification/font-size-display-browser-zoom50-r3/FINAL-HANDOFF-HX.json)는 p18의2..17에서 혼합/빈 숫자값,2..10에서15pt,12..17에서13pt와 휴먼명조·7언어 tooltip이 실제 Native7552 기대와 맞음을 확인했다. 검사 하네스에서 원본문서를 편집하거나 별도 Native 조회·복사·저장을 호출하지 않았다. 각 Chrome은 최종 inactive·pid null·PS[]이며 최초 cleanup updater 잔류와 이후 자연 종료 확인은 구분한다. 메모리 guard·분수 좌표 CLI 실패를 보존하며100% 통과로 승계하지 않는다. caret-only·multi·스타일명 원본·인쇄/IME/전체 조판은 미검증이다.

source7ff2의 CI41844645729 성공과 private128 manifest7f9becea 전환(PID91155/session68047)·외부 HTTPS4 exact는 메인이 확인했다. [private LIVE e495](../zig-out/verification/font-size-display-private-live-r1/FINAL-HANDOFF.json)도 H5 50%의 동일 세 범위 표시를 확인했고 Native 편집0·소유 Chrome 종료를 기록했다. undo는 다시 검사하지 않았으며 QA의 H5/HX 범위와 구분한다.

공개 font manifest28713707의196경로는 기존193을 보존한다. source9a6f의 Quality41846111390·Docs41846111462 성공과 HTTP manifest exact는 메인이 확인했다. [공개 H5 50% 최종 spot](../zig-out/verification/font-size-display-public-live-r1/FINAL-HANDOFF.json)은 gallery101에서 세 범위의 글꼴/혼합·15/13·7언어 tooltip을 확인했고 이 관측 단계의 Native 편집은0이었다. 이어진 별도 다문단 밑줄 적용·undo/redo 단계에는 Native 편집이 있었으며, 적용 뒤 포인터/재선택0으로 current·paint·focus·선택과 도구 false/활성→true/활성을 확인했다. 각 단계의 범위를 구분하며 이 공개 H5 50% 결과를100%·HX 공개·caret-only·다문단 글꼴/크기 관측·스타일 이름 API 지원으로 확대하지 않는다. 소유 Chrome은 모두 종료했다.
