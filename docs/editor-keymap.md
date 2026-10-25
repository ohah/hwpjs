# JSON 단축키 설정 계약

버전1은 단일 물리 키 조합을 명령 ID로 연결합니다. 코어의 `packages/core/src/keymap/defaults.json`이 기본값과 기본 번역의 단일 출처입니다. `parseKeymapConfig`가 입력 검증·소유된 불변 복사를, `mergeKeymap`이 기본값과 사용자 덮어쓰기를, `compileKeymap`/`resolveKeyboardShortcut`이 플랫폼별 순수 매칭을 소유합니다. DOM 이벤트 처리는 공개 `@hwpjs/vanilla`의 `createKeyboardShortcuts`가 담당합니다. React/Svelte 데모도 이 같은 adapter를 사용합니다.

```json
{
  "version": 1,
  "bindings": [
    {"id":"find","command":"find","code":"KeyK","modifiers":["Mod"],"labelKey":"command.find"},
    {"id":"custom-statistics","command":"word-count","code":"F9","modifiers":[],"labelKey":"custom.statistics"},
    {"id":"bold","command":"bold","code":"KeyB","modifiers":["Mod"],"enabled":false}
  ],
  "messages": {
    "ko": {"custom.statistics":"내 문서 통계"},
    "en": {"custom.statistics":"My Statistics"}
  }
}
```

`id`는 설정 항목의 안정적인 식별자입니다. 같은 id는 전체 항목을 교체하고 새 id는 항목을 추가합니다. 기본값을 해제하려면 해당 id의 완전한 항목에 `enabled:false`를 지정합니다. 같은 명령의 별칭은 각 id가 별도이므로 기본 별칭도 해제하려면 각각 지정해야 합니다. 미지 필드·중복 id·잘못된 code/modifier·같은 플랫폼에서 겹치는 키는 거부하며 적용 중인 설정은 유지합니다.

`command`는 번역하지 않는 명령 ID입니다. 순수 core는 임의 host 명령 ID를 허용하며 host의 실행 registry가 이를 연결합니다. 데모는 실제로 알고 있는 명령만 허용하고 인자 입력이 필요한 글자 크기/배율 명령은 버전1 설정에서 거부합니다. JSON에 실행 코드·함수·임의 URL을 넣는 방식은 제공하지 않습니다.

`code`는 `KeyboardEvent.code` 형식의 `KeyB`, `Digit1`, `F9` 등 물리 키입니다. 한/영 입력 상태로 달라지는 `event.key`를 명령 식별자로 쓰지 않습니다. `modifiers`는 `Mod/Control/Meta/Alt/Shift`의 중복 없는 배열이고 정확하게 일치해야 합니다. `Mod`는 mac에서 Meta, windows/linux에서 Control입니다. Mod와 Control/Meta의 동시 지정은 거부합니다. `platform`은 생략/all/mac/windows/linux 중 하나입니다.

`messages`의 key는 locale, 값은 labelKey→일반 문자열입니다. `resolveShortcutLabel`은 정확한 locale, 기본 언어, en, 항목 id 순서로 조회합니다. 언어 선택은 표시 문구만 바꾸며 물리 키와 명령 ID는 바꾸지 않습니다. 이 설정은 단축키 안내의 다국어 계약이며 데모 전체 UI의 모든 문구 번역을 의미하지 않습니다.

```ts
import {DEFAULT_KEYMAP, parseKeymapConfig, mergeKeymap} from '@hwpjs/core';
import {createKeyboardShortcuts} from '@hwpjs/vanilla';

const config = mergeKeymap(DEFAULT_KEYMAP, parseKeymapConfig(JSON.parse(jsonText)));
const shortcuts = createKeyboardShortcuts({
  root: editorRoot, config, fallback: DEFAULT_KEYMAP, platform: 'mac',
  isAvailable: command => commandRegistry.canExecute(command),
  execute: command => commandRegistry.execute(command),
});
// 설정 변경: shortcuts.setConfig(nextConfig)
// 호스트 해제: shortcuts.dispose()
```

adapter는 editor root 안에서만 동작하며 일반 입력창/선택 상자/contenteditable의 텍스트 편집은 가로채지 않습니다. Canvas의 명시적 문서 입력면은 대상입니다. IME 조합·229·AltGraph는 매칭하지 않고 반복 입력은 명령을 중복 실행하지 않습니다. 처리한 키는 기존 Canvas handler로 전달하지 않습니다. fallback은 해제·재지정된 기본 키가 기존 Canvas 명령을 실행하지 않도록 하는 용도이며, 해제된 키의 브라우저 기본 동작까지 강제로 차단하지는 않습니다.

데모의 ‘단축키 설정’에서 JSON 가져오기/내보내기, 기본값 복원, 한국어/English 안내를 제공합니다. 설정은 해당 호스트 수명 동안 유지하며 자동 디스크 저장·브라우저 간 동기화는 하지 않습니다. 파일 입력은 256KiB로 제한하고 최신 가져오기만 적용합니다. 문서/선택에서 실행할 수 없는 명령은 단축키를 등록해도 실행 가능해지지 않습니다.

기본 조합은 [공식 WebHwpCtrl 단축키 표](https://webhwpctrl.cloud.hancom.com/webhwpctrl/js/rights/shortcut/shortcut.htm)의 되돌리기/다시 실행/찾기/바꾸기/서식을 참고합니다. 저장 Mod+S 및 기존 Mod+Y redo 호환 별칭도 기본 JSON에 명시했습니다. 후자는 공식 표의 Ctrl+Y 한 줄 지우기와 다른 기존 호환 동작이며 JSON에서 해제할 수 있습니다. OS/브라우저가 선점해 페이지에 전달하지 않는 조합은 웹 앱이 보장할 수 없습니다. 연속 키(chord sequence), 명령 인자, 전역 OS hotkey는 버전1 지원 범위가 아닙니다.

## 실행 검증

2026-10-25 공개 Tailscale 데모에서 Vanilla/React/Svelte × charshape.hwp/charshape.hwpx의6건을 검사했습니다. 기본 키로 바꾸기·undo/redo·저장, 실제 다운로드·재열기, custom Mod+K/F9, 해제된 Mod+B의 Native 명령 미발생·저장 bytes 불변, English 안내, JSON 내보내기, 충돌/미지 명령 거부, 기본값 복원을 확인했습니다. 키 이벤트의 `isTrusted`, 저장 Native 요청 정확히1회, 파일 신규 생성 또는 쓰기 timestamp 변경과 응답 bytes 일치도 요구했습니다. HWPX3개 저장본은 독립 전체 XML/비대상 ZIP의 normal/`-O` 대조와 잘못된 기대 거부가 통과했습니다. HWP5 독립 Section/비대상 스트림 검증은 별도 통합 기록을 따릅니다.

실행은 `node tools/editor-shortcuts-browser-audit.mjs https://macstudio.tailed42f2.ts.net:10000`입니다. 실행기는 읽기 전용 Worker/키 관측기를 사용하고 소유 브라우저를 finally 종료합니다. 마지막 증거는 `zig-out/verification/keymap-browser-final/`의 metadata/results/cleanup JSON과 실제 저장본·스크린샷입니다. 모든 fixture의 조판 동치나 OS clipboard 권한 허용을 증명하는 검사는 아닙니다.

정확한 제품 경로를 지정한 설정·키 매칭·DOM adapter·비동기 설정 경합 검사는31/31 통과했습니다. `setConfig`/reset/새 import가 이전 파일 읽기 결과와 오류를 무효화하고 dispose 뒤 남은 handler가 실행하지 않는 것을 포함합니다. 임시 후보 사본까지 포함한 Bun 문자열 경로 필터 집계를 이 수치에 합산하지 않습니다. HEAD 기반 core 공개 후보의 독립 사본 검사는94/94였습니다.
