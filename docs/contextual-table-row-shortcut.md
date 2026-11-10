# 표 안의 Ctrl+Enter 행 삽입

데모 문서 입력에서 정확한 **Ctrl+Enter**는 현재 지원되는 원본·생성 표 셀의 아래에 행 하나를 삽입합니다. 기존 표 행 삽입 tool과 source/generated port, Surface의 현재 선택 lease를 그대로 사용합니다. Native 명령이나 Core 기본 keymap은 추가하지 않습니다. 한컴의 [공식 쪽 나누기 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/break/page_break.htm)은 표 안 Ctrl+Enter를 한 줄 삽입으로 구분합니다.

본문 Ctrl+Enter는 기존 쪽 나누기 경로로 전달합니다. Meta+Enter, Ctrl+Shift+Enter 및 Alt 조합에 새 행 삽입 기본 동작을 부여하지 않습니다. 지원되지 않거나 미확정인 표 선택에서 Ctrl+Enter를 쪽 나누기로 대체하지 않습니다. IME·AltGraph·반복 키에는 행 삽입을 요청하지 않으며, pending·modal·readonly·오래된 선택·overflow preview의 구조 편집 거부는 기존 Surface/tool/port가 유지합니다.

## JSON 설정

기본 binding은 데모 설정에만 포함하며 내보내기와 기본값 복원에도 포함합니다. binding ID와 command는 `generated-table-insert-row`이고, 이 UI 명령은 원본 표와 생성 표를 모두 라우팅합니다. 이 기본 binding은 전역 shortcut host에 설치하지 않으므로 표 명령이 비활성이라는 이유로 본문 Ctrl+Enter를 가로막지 않습니다.

해제 예:

```json
{
  "version": 1,
  "bindings": [
    {
      "id": "generated-table-insert-row",
      "command": "generated-table-insert-row",
      "code": "Enter",
      "modifiers": ["Control"],
      "enabled": false
    }
  ]
}
```

같은 ID를 `code: "F9", modifiers: []`로 바꾸면 표 안 F9로 재지정됩니다. 해제·재지정 후 표 안의 이전 Ctrl+Enter는 행 삽입이나 쪽 나누기를 요청하지 않습니다. 본문 Ctrl+Enter는 유지합니다. 다른 명령에 같은 키를 주려면 기존 ID를 해제하고 해당 명령의 binding을 설정하거나, 해당 ID의 command를 바꿀 수 있습니다. 활성 binding 충돌은 기존 keymap 검증이 거부합니다.

설정이 바뀔 때 binding 목록을 한 번 분리하고 matcher를 구성합니다. keydown은 구성된 matcher와 현재 tool/Surface 관측을 재사용하며 새 문단·표 목록 검색이나 Native eligibility 추정을 추가하지 않습니다. 기존 관측·port 내부의 검증 비용까지 O(1)이라고 주장하지 않습니다.

## 소스 검증 범위

새 `apps/demo/tests/contextual-table-row-shortcut.test.ts`는 실제 shortcut host 및 기존 source/generated port를 사용합니다. 별도 사례는 실제 Canvas/Surface와 통제한 renderer/Core로 modal·composition·readonly·overflow 구조 gate와 비동기 A→B→A를 확인합니다. 브라우저 전파·Native 행 삽입·독립 저장·배포 검증의 대체가 아닙니다.

증거와 최종 파일 해시는 `zig-out/verification/contextual-table-row-shortcut-r1/receipt.json`이 소유합니다. 소스 검증과 아래 실제 브라우저 검증을 구분합니다. 커밋·배포의 최종 상태는 별도 확인합니다.


## 실제 브라우저 범위

최종 manifest `4128bf767260ddd7aa68b963d603f82f2b7cc1b50607adb2dda5de46eb4450fd`, WASM `438044e0060fb0f40ab8a4a76eee2027e387f68579d547487fcd74ca88129088`에서 원본 HWP5/HWPX × Vanilla·React·Svelte 6경로와 Vanilla의 실제 UI 생성 표 2형식, 너비 초과 표의 구조 편집 거부 2형식을 확인했습니다. 신뢰된 Ctrl+Enter 한 번의 정확한 한 행 삽입, 폭·비대상 텍스트 보존, 독립 CFB/ZIP/XML 저장·undo/redo·재열기를 확인했습니다. 본문에서는 원래 쪽 나누기 비트/XML 속성과 분할 내용이 저장됨을 별도 oracle로 검사했습니다.

생성 표는 실제 UI에서 생성한 같은 활성 세션에서 검사했습니다. 현재 HWP5의 생성 문단 참조 제한을 지키기 위해 본문만 저장·재열어 원본 host를 만든 뒤 표를 생성했으며, 이미 저장된 표를 다시 열어 생성 표로 계수하지 않았습니다. 같은 세션에서 Enter로 만든 미지원 문단의 표 생성은 별도 음성 사례로 보존합니다.

전체 run의 API 사전조건은 정식 경로 대신 redirect를 금지한 별칭 경로로 접근해 실패했습니다. 표 10경로와 대상 거부 1경로는 그 전에 통과했고 원본 failed summary는 유지합니다. 정식 경로에서 API 허용 2경로·거부 2경로를 별도 실행했습니다. 단일 연속 15경로 실행으로 바꾸어 표기하지 않습니다. 상세 수용 범위와 소유 브라우저 종료는 `browser/final-accepted.json`이 소유합니다. 전체 사용자 문서, 임의 병합·중첩 표, 새 문단 삽입 지원 확대와 원본 한글 조판 동치를 입증하지 않습니다.
