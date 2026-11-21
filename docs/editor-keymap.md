# JSON 단축키 설정 계약

## 가져오기 적용과 브라우저 저장 실패

JSON 검증과 현재 호스트 적용이 성공해도 localStorage가 거부하거나 제공되지 않으면 브라우저 저장은 실패합니다. commit의 저장 결과를 내부적으로 전달하며, 가져오기 handler는 저장 성공일 때만 일반 성공 상태를 표시합니다. 실패 시 ‘설정은 적용했지만 브라우저에 저장하지 못했습니다. JSON으로 내보내세요.’ 경고를 마지막 상태로 유지합니다. 현재 적용을 취소하거나 이전 저장 항목을 지우지 않습니다.

예를 들어 F9 적용 뒤 저장이 실패하면 현재 호스트에서는 F9가 동작합니다. 새 호스트는 저장 항목이 없으면 기본 KeyN, 이전 F8 저장 항목이 있으면 F8로 시작합니다. localStorage API의 성공 반환을 검사할 뿐 운영체제 디스크 flush, 브라우저 간 동기화나 영구 보존을 보장하지 않습니다.

저장 실패·저장 API 부재·이전 저장 설정 유지·충돌 거부·오래된 비동기 가져오기 무효화를 검사합니다. 현재 적용과 다음 호스트의 복원을 구분하며, 저장 실패를 성공 안내로 덮지 않습니다.

버전1은 단일 물리 키 조합을 명령 ID로 연결합니다. 코어의 `packages/core/src/keymap/defaults.json`이 기본값과 기본 번역의 단일 출처입니다. `parseKeymapConfig`가 입력 검증·소유된 불변 복사를, `mergeKeymap`이 기본값과 사용자 덮어쓰기를, `compileKeymap`/`resolveKeyboardShortcut`이 플랫폼별 순수 매칭을 소유합니다. DOM 이벤트 처리는 공개 `@ohah/hwpjs/vanilla`의 `createKeyboardShortcuts`가 담당합니다. React/Svelte 데모도 이 같은 adapter를 사용합니다.

```json
{
  "version": 1,
  "bindings": [
    {
      "id": "find",
      "command": "find",
      "code": "KeyK",
      "modifiers": ["Mod"],
      "labelKey": "command.find"
    },
    {
      "id": "custom-statistics",
      "command": "word-count",
      "code": "F9",
      "modifiers": [],
      "labelKey": "custom.statistics"
    },
    { "id": "bold", "command": "bold", "code": "KeyB", "modifiers": ["Mod"], "enabled": false }
  ],
  "messages": {
    "ko": { "custom.statistics": "내 문서 통계" },
    "en": { "custom.statistics": "My Statistics" }
  }
}
```

`id`는 설정 항목의 안정적인 식별자입니다. 같은 id는 전체 항목을 교체하고 새 id는 항목을 추가합니다. 기본값을 해제하려면 해당 id의 완전한 항목에 `enabled:false`를 지정합니다. 같은 명령의 별칭은 각 id가 별도이므로 기본 별칭도 해제하려면 각각 지정해야 합니다. 미지 필드·중복 id·잘못된 code/modifier·같은 플랫폼에서 겹치는 키는 거부하며 적용 중인 설정은 유지합니다.

`command`는 번역하지 않는 명령 ID입니다. 순수 core는 임의 host 명령 ID를 허용하며 host의 실행 registry가 이를 연결합니다. 데모는 실제로 알고 있는 명령만 허용하고 인자 입력이 필요한 글자 크기/배율 명령은 버전1 설정에서 거부합니다. JSON에 실행 코드·함수·임의 URL을 넣는 방식은 제공하지 않습니다.

`code`는 `KeyboardEvent.code` 형식의 `KeyB`, `Digit1`, `F9` 등 물리 키입니다. 한/영 입력 상태로 달라지는 `event.key`를 명령 식별자로 쓰지 않습니다. `modifiers`는 `Mod/Control/Meta/Alt/Shift`의 중복 없는 배열이고 정확하게 일치해야 합니다. `Mod`는 mac에서 Meta, windows/linux에서 Control입니다. Mod와 Control/Meta의 동시 지정은 거부합니다. `platform`은 생략/all/mac/windows/linux 중 하나입니다.

`messages`의 key는 locale, 값은 labelKey→일반 문자열입니다. `resolveShortcutLabel`은 정확한 locale, 기본 언어, en, 항목 id 순서로 조회합니다. 언어 선택은 표시 문구만 바꾸며 물리 키와 명령 ID는 바꾸지 않습니다. 이 설정은 단축키 안내의 다국어 계약이며 데모 전체 UI의 모든 문구 번역을 의미하지 않습니다.

```ts
import { DEFAULT_KEYMAP, parseKeymapConfig, mergeKeymap } from '@ohah/hwpjs';
import { createKeyboardShortcuts } from '@ohah/hwpjs/vanilla';

const config = mergeKeymap(DEFAULT_KEYMAP, parseKeymapConfig(JSON.parse(jsonText)));
const shortcuts = createKeyboardShortcuts({
  root: editorRoot,
  config,
  fallback: DEFAULT_KEYMAP,
  platform: 'mac',
  isAvailable: (command) => commandRegistry.canExecute(command),
  execute: (command) => commandRegistry.execute(command),
});
// 설정 변경: shortcuts.setConfig(nextConfig)
// 호스트 해제: shortcuts.dispose()
```

adapter는 editor root 안에서만 동작하며 일반 입력창/선택 상자/contenteditable의 텍스트 편집은 가로채지 않습니다. Canvas의 명시적 문서 입력면은 대상입니다. IME 조합·229·AltGraph는 매칭하지 않습니다. 반복 keydown은 undo·redo에만 허용하고 다른 명령은 반복 실행하지 않습니다. 추가 반복 타이머 없이 이미 접수한 이력 명령의 순서를 보존하며, keyup은 새 명령을 만들지 않습니다. 자세한 계약과 대표 운영 검증은 [이력 단축키 반복](history-key-repeat.md)을 따릅니다. 처리한 키는 기존 Canvas handler로 전달하지 않습니다. fallback은 해제·재지정된 기본 키가 기존 Canvas 명령을 실행하지 않도록 합니다. 이력·clipboard 기본키와 차단된 반복 이벤트는 브라우저 기본 이력/편집으로도 새지 않게 막으며, 모든 일반 브라우저 기본키를 일괄 차단하는 계약은 아닙니다.

데모의 ‘단축키 설정’에서 JSON 가져오기/내보내기, 기본값 복원, 한국어/English 안내를 제공합니다. 설정은 이 브라우저의 localStorage에 저장하며, 브라우저 간 동기화는 하지 않습니다. 파일 입력은 256KiB로 제한하고 최신 가져오기만 적용합니다. 문서/선택에서 실행할 수 없는 명령은 단축키를 등록해도 실행 가능해지지 않습니다.

기본 조합은 [공식 WebHwpCtrl 단축키 표](https://webhwpctrl.cloud.hancom.com/webhwpctrl/js/rights/shortcut/shortcut.htm)의 되돌리기/다시 실행/찾기/바꾸기/서식을 참고합니다. 저장 Mod+S 및 기존 Mod+Y redo 호환 별칭도 기본 JSON에 명시했습니다. 후자는 공식 표의 Ctrl+Y 한 줄 지우기와 다른 기존 호환 동작이며 JSON에서 해제할 수 있습니다. OS/브라우저가 선점해 페이지에 전달하지 않는 조합은 웹 앱이 보장할 수 없습니다. JSON 버전1은 단일 조합만 표현합니다. 기존 Ctrl+G → C/T 조판 부호 순차 키는 별도 모듈이 처리하며 명령 인자와 전역 OS hotkey는 지원하지 않습니다.

## 실행 검증

2026-10-25 공개 Tailscale 데모에서 Vanilla/React/Svelte × charshape.hwp/charshape.hwpx의6건을 검사했습니다. 기본 키로 바꾸기·undo/redo·저장, 실제 다운로드·재열기, custom Mod+K/F9, 해제된 Mod+B의 Native 명령 미발생·저장 bytes 불변, English 안내, JSON 내보내기, 충돌/미지 명령 거부, 기본값 복원을 확인했습니다. 키 이벤트의 `isTrusted`, 저장 Native 요청 정확히1회, 파일 신규 생성 또는 쓰기 timestamp 변경과 응답 bytes 일치도 요구했습니다. HWPX3개 저장본은 독립 전체 XML/비대상 ZIP의 normal/`-O` 대조와 잘못된 기대 거부가 통과했습니다. HWP5 독립 Section/비대상 스트림 검증은 별도 통합 기록을 따릅니다.

실행은 `node tools/editor-shortcuts-browser-audit.mjs http://127.0.0.1:8080`입니다. 실행기는 읽기 전용 Worker/키 관측기를 사용하고 소유 브라우저를 finally 종료합니다. 마지막 증거는 `zig-out/verification/keymap-browser-final/`의 metadata/results/cleanup JSON과 실제 저장본·스크린샷입니다. 모든 fixture의 조판 동치나 OS clipboard 권한 허용을 증명하는 검사는 아닙니다.

정확한 제품 경로를 지정한 설정·키 매칭·DOM adapter·비동기 설정 경합 검사는31/31 통과했습니다. `setConfig`/reset/새 import가 이전 파일 읽기 결과와 오류를 무효화하고 dispose 뒤 남은 handler가 실행하지 않는 것을 포함합니다. 임시 후보 사본까지 포함한 Bun 문자열 경로 필터 집계를 이 수치에 합산하지 않습니다. HEAD 기반 core 공개 후보의 독립 사본 검사는94/94였습니다.

## 기본 키의 발견성과 설정 갱신

데모의 ‘단축키 · 설정’ 버튼은 키 기록·활성화·JSON 설정에 진입합니다. 메뉴 kbd와 도구 title/aria-keyshortcuts는 적용 중인 같은 설정을 표시합니다. 기본 열기 Mod+O, 표 만들기 Mod+Alt+T 및 지원 정렬을 연결하며 표 기본값은 HWPJS 정책입니다. 공식 표의 모든 기능을 지원한다는 의미가 아닙니다. 일반 입력란·모달·iframe·IME·229·AltGraph를 가로채지 않고 Core 가용성은 계속 검사합니다. 본문의 일반 문자 P는 그대로 입력하며, 선택 개체 P의 설정 연동은 아래 계약을 따릅니다.

표시 갱신은 config별 command별 목록 Map과 id별 Map을 한 번 구성합니다. 순서·복수 바인딩·플랫폼 필터·비활성 행의 수정 가능성을 유지합니다. command의 표시/ARIA 문자열도 한 번 계산합니다. 바인딩 n, 메뉴/도구 노드 m, 설정 행 r에 대해 인덱싱과 순회는 평균 O(n+m+r), 공간은 O(n)입니다. 메시지 검증·문자열 길이·실제 출력 비용은 별도이며 전체 작업을 O(n)이라 부르지 않습니다.

2026-11-15 동결 object37+ruler19의52 소스에 단축키9를 결합했습니다. shell 중복1을 제외한60 경로이고 기존 CI 수정·본 문서를 더한 인계 manifest는61 경로입니다. 새 일반 SDK/gallery와 명시 a66에서 단축키 Node59, 개체70+눈금자23 Node93 및 타입 검사를 통과했습니다. 새 GUI는 실제 입력·undo/redo·사용자 설정·HWPX 저장/재열기10 관측과 눈금자 배율·문서 교체·차트/그림 속성 및 모달 경계7 관측입니다. 이전 READY9의33 GUI와 HWP5 검사는 재실행하지 않았으며 이번 결과로 재분류하지 않습니다.

브라우저가 hidden일 때 RAF가 진행되지 않아 이전 Canvas를 유지한 최초 관측을 보존했습니다. 소유 페이지를 visible/focused로 활성화한 뒤 같은 문서 교체와 차트가 표시됐으며 제품 변경은 없었습니다. 이는 자연 발생률이나 모든 브라우저의 비가시 탭 동작을 보증하지 않습니다. 새 엔진 컴파일·Root 변경·Git 쓰기·npm 실행은 수행하지 않았습니다.

## 선택 개체 속성 단축키

[한컴 공식 개체 속성 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/insert/objectattribute/objectattribute.htm)은 개체를 선택한 상태의 P를 안내합니다. 이 기능 관계만 참고하며 대화상자 디자인이나 HwpCtrl API는 가져오지 않습니다. 데모는 이미 지원하는 그림, 차트, 글상자 테두리의 기존 `object-properties` 명령과 선택 검증 경로를 사용합니다. 지원하지 않는 개체가 단축키 등록만으로 편집 가능해지지 않습니다.

데모 전용 기본 `object-properties` 항목은 KeyP와 빈 modifiers입니다. Core 전역 기본 JSON에는 문자를 가로채는 P를 추가하지 않습니다. 적용 중인 JSON으로 안내, 내보내기, 비활성화, F9 등의 재지정, 별칭과 기본값 복원을 함께 처리합니다. 기존 저장 설정이 다른 명령에 일반 P를 이미 할당했다면 새 암시적 P 기본값을 비활성화해 사용자 설정을 유지합니다. 명시적으로 같은 키를 두 명령에 중복 등록하는 오류는 기존처럼 적용 전에 거부합니다.

이 명령의 키는 실제로 선택된 개체가 있고 포커스가 같은 문서 Canvas에 있을 때만 실행합니다. 본문 입력, 일반 설정 입력란, 다른 문서, IME, 229, AltGraph, 모달과 반복 키로 실행하지 않습니다. 비활성화 또는 재지정한 예전 P가 standalone Canvas의 기존 P 처리로 새지 않게 문맥 안에서만 차단합니다. 비활성 기본 bold 등의 키를 속성에 재할당해도 일반 단축키의 이전 기본값 차단보다 문맥 처리를 우선하며 활성 사용자 명령의 키 소유권은 유지합니다. 기존 Vanilla standalone의 일반 P는 유지하며 AltGraph는 데모와 같은 조건으로 제외합니다.

176a014d0 기반 격리 소스에서 새 focused14와 정규 단축키 명부 전체79가 통과했고 기존 companion 타입 검사도 통과했습니다. 이 결과는 모의 DOM 경계와 실제 소스 adapter 검증이며 새 SDK 빌드, 브라우저의 trusted 입력, 실제 속성 변경과 저장 검증을 대신하지 않습니다.
