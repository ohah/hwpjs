# 실험용 HWP5 편집 JS/WASM API

기존 native [텍스트 편집](hwp5-plain-text-edit-experiment.md)·[글자 모양 적용](hwp5-character-format-edit.md)을 제한적으로 JS에 연결합니다. 일반 문서 편집기·기존 Rust JSON 호환 API·HWPX 편집 API가 아닙니다. 원본 적격성·범위·리소스 참조·저장 정책은 위 native 계약이 단일 출처입니다.

## 사용과 반환값

```js
import { createExperimentalHwp5Editor } from '../js/hwp5-editor.mjs';

const editor = await createExperimentalHwp5Editor(wasmBytes, hwpBytes);
try {
  console.log(editor.sectionCount(), editor.paragraphCount(0));
  console.log(editor.text(0, 1));
  editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: '한😀' });
  editor.setCharacterFormat({ section: 0, paragraph: 1, startUnit: 0, endUnit: 1, charShapeId: 0 });
  // 기본 save()는 변경 후 LayoutReflowRequired 오류를 반환합니다.
  const { bytes, layoutRequiresReflow } = editor.save({ allowStaleLayout: true });
  console.log(bytes.byteLength, layoutRequiresReflow);
} finally {
  editor.close();
}
```

`wasmBytes`는 WASM 바이트 또는 컴파일된 `WebAssembly.Module`입니다. HWP 입력은 기존 JS 입력 어댑터와 같은 ArrayBuffer/Uint8Array 계열이며 최대 64 MiB입니다. 각 factory 호출은 독립 WASM 인스턴스와 native 세션을 만들고 원본을 소유 복사합니다.

- `sectionCount()`, `paragraphCount(section)`, `characterShapeCount()`는 정수 개수를 반환합니다. 문단 인덱스는 기존 미리보기의 구역별 전체 문단 순서(중첩 포함)를 따르지만 변경 가능한 대상은 native 적격성 검사로 제한합니다.
- `copyText(section, paragraph)`는 마지막 PARA_BREAK(13)까지 포함한 UTF-16LE의 소유 `Uint8Array` 복사본, `text(...)`는 같은 내용을 문자열로 반환합니다. 끝 표식은 편집할 수 없습니다.
- `splice({...})`는 현재 UTF-16 위치의 반열린 범위 `[startUnit, endUnit)`를 교체하며 반환값은 없습니다. 기본 `rangePolicy: 'reject'`, 명시적 `'half-open'`의 의미와 range tag 이동은 native 계약을 따릅니다. 입력 UTF-8은 최대 4 MiB이며 잘못된 surrogate를 대체 문자로 자동 보정하지 않습니다.
- `setCharacterFormat({...})`는 기존 0-based CharShape ID만 적용하고 반환값은 없습니다. 새 글꼴·서식 리소스 생성은 없습니다.
- 인덱스·위치·ID는 실제 정수 `0..0xffffffff`만 허용합니다. 음수·소수·NaN·문자열·Boolean의 암묵적 변환을 거부합니다. 예상 가능한 입력/대상 오류는 JS 예외로 전달되며 실패한 native 편집은 모델을 바꾸지 않습니다.
- `save({ allowStaleLayout: false })`가 기본입니다. 무변경은 원본 bytes와 `layoutRequiresReflow: false`, 변경 후 opt-in 저장은 새 CFB bytes와 `true`를 반환합니다. 줄 캐시 제거는 재조판 완료가 아닙니다. 일반 사용자용 안전한 저장으로 취급하지 않습니다.
- 반환 bytes는 복사본이므로 다음 호출·close 뒤에도 유효하며 수정해도 세션을 바꾸지 않습니다. `close()`는 반복 호출 가능하고 이후 다른 메서드는 `EditorClosed`입니다.

## ABI·책임·수명

`src/wasm/hwp5_edit.zig`는 한 인스턴스당 한 세션·출력 버퍼·오류 전달만 소유하며 명령의 의미를 재구현하지 않습니다. `js/hwp5-editor.mjs`는 입력 타입/한도·WASM 호출·출력 복사와 해제를 소유합니다. 모델 값은 native `Session`만 소유합니다.

ABI 6의 필수 읽기 export는 그대로 두고 `js/abi-schema.mjs`의 별도 optional `EXPERIMENTAL_EDITOR_FUNCTIONS`로 기능을 검사합니다. 구형 ABI 6 읽기 제품은 기존 reader에서 사용 가능하지만 이 factory에서는 누락 export 오류를 냅니다. raw ABI 출력은 다음 copy/save/성공한 open/close/output_free까지 유효합니다. 실패한 open은 이전 세션을 보존합니다. count 오류 sentinel은 `0xffffffff`, 명령 실패는 `0`이고 공통 CFB 오류 채널을 사용합니다. raw 포인터는 기존 ABI처럼 호스트의 유효 메모리를 전제하며 JS 경계가 할당을 소유합니다.

## 웹 연결과 남은 범위

[Canvas 화면](canvas-text-preview.md)의 선택적 ‘편집 실험’ 폼으로 명령을 보냅니다. 이 폼은 Canvas 내부 caret·마우스 선택·IME 입력 구현이 아닙니다. 글자 모양 ID는 native 모델에 적용되지만 현재 Canvas는 시스템 글꼴의 텍스트만 그리며 서식 변화를 표시하지 않습니다. 웹 저장/다운로드 버튼도 없습니다.

Worker는 파일마다 유지되는 세션을 소유하고 변경 후 native text에서 표시용 스냅샷만 갱신합니다. 표시 스냅샷은 저장이나 명령의 원본으로 사용하지 않습니다. 파일 재선택은 Worker를 종료해 이전 세션을 버리고 원본을 다시 읽습니다. native 거부는 표시를 유지하고, 변경 성공 뒤 표시 갱신 실패는 화면을 비우고 재선택을 요구합니다.

## 2026-10-01 검증

JS/WASM 4개 집중 검사는 독립 세션·원본 입력 수정 후 소유권·close 후 출력 수명·저장 기본 거부·반복 저장·정수/Unicode/범위/ID 오류 원자성·raw ABI 잘못된 정책/실패한 재open/출력 해제를 확인합니다. 실제 `charshape`, `parashape`, `linespacing`, `facename`, `underline-styles` 5개는 CFB.js·Node raw DEFLATE와 독립 레코드 순회로 비대상 스트림/레코드 보존, 텍스트 동일성, 선택 범위 전체 코드 단위의 서식 ID와 헤더의 허용 count 변경을 대조합니다. 별도 UI 상태 검사 1개는 거부 후 유지·commit 뒤 표시 실패 시 잠금·재선택 초기화를 검증합니다. 실행 명령은 [개발 명령](development-commands.md)이 소유합니다.

Chromium에서 외부 공개 주소의 실제 `charshape.hwp`로 실험 활성화·`한😀` 삽입의 Canvas/대체 텍스트 반영·surrogate 중간 삽입 거부 후 텍스트 보존·글자 모양 명령·잘못된 파일의 화면 초기화·원본 재선택 후 편집 초기화를 확인했습니다. 로컬 스크린샷은 `/private/tmp/hwpjs-edit-preview.png`입니다. 한컴 프로그램 조판·Firefox/Safari·최대 크기 부하·HWPX 편집은 검증한 범위가 아닙니다.

집중 API/UI 검사 5개는 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다. ReleaseSafe 전체 Zig 2,687개, 기존 native 실파일 audit의 텍스트 75건·서식 152건과 거부/독립 오라클 반례, 기존 CFB/미리보기/문서 Node 회귀 30개도 통과했습니다. 390×844 합성 viewport에서 편집 폼의 가로 넘침이 없고 브라우저 오류 목록이 비어 있었습니다. 전체 명세 완성이나 모든 실파일의 편집 가능성을 뜻하지 않습니다.
