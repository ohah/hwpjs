# Canvas 제어 표시와 원문 위치 연결

기존 탭을 포함한 문단의 직접 입력을 연결합니다. native의 [제어 보존 계약](hwp5-control-text-edit.md)을 변경하지 않으며 새 탭 생성·탭 삭제·원본 탭 조판은 아직 지원하지 않습니다.

## 책임과 SSOT

`text-offsets.mjs`는 native 미리보기 토큰의 시작 위치와 raw 길이만 소비합니다. 부가 데이터를 해석하거나 제어 폭 표를 복제하지 않습니다. 탭은 textarea의 1 UTF-16 단위로 표시하고, 탭 뒤 경계에는 원문 위치를 기록합니다. 일반 텍스트는 같은 길이를 유지하며 끝 PARA_BREAK는 표시하지 않습니다. 토큰 시작·종결·전체 길이가 맞지 않거나 다른 제어가 섞이면 탭 편집 후보를 만들지 않습니다.

`content.mjs`는 표시 문자열과 파생 `sourceOffsets`를 반환합니다. 표시가 잘렸으면 문단 입력을 비활성화하고 위치 대응표도 제공하지 않습니다. 이 대응표는 저장 모델이나 원문 캐시가 아닙니다.

`canvas-editor.mjs`는 textarea의 표시 좌표로 caret·선택·임시 입력을 유지합니다. 명령 직전에만 확정 표시 대응표로 splice 시작/끝을 원문 위치로 변환합니다. 진행 중 입력을 한 번에 하나씩 native에 보내고 다음 명령은 응답에서 갱신된 대응표를 사용합니다. 실패 복원은 표시 좌표를 사용합니다. 제어 삭제를 native에서 거부하며 JS에서 저장 의미를 재구현하지 않습니다.

`layout.mjs`의 `displayRunText`가 탭의 실험용 4칸 표시를 소유합니다. 동일 변환으로 폭을 측정하고 `renderer.mjs`가 그립니다. HWP 탭 정의의 위치·정렬·채움선 재현은 아닙니다. 탭을 포함한 clipboard 전체 교체 등 제어를 건드리는 명령은 거부될 수 있습니다.

## 2026-10-01 검증

실제 software 문단 33의 제품 WASM 연결 테스트에서 표시 범위 `[1,3)`이 원문 `[8,10)`으로 변환되는 것을 확인했습니다. 대기 입력이 첫 응답 뒤 갱신된 원문 위치 11로 전송되고, 탭의 16바이트 부가 정보가 보존됐습니다. 탭 표시 삭제는 `UnsupportedControlDeletion`으로 거부되고 확정 문자열과 원문이 복원됩니다.

순수 검사는 여러 탭·이모지 코드 단위·모든 표시 경계·불완전 토큰·잘린 표시의 대응표 제외·폭 측정 일치·원본 projection 불변성을 검사합니다. 최초 복사본 비교의 Buffer/Uint8Array 타입 차이를 실제 제품과 같은 Uint8Array로 수정했습니다. Canvas·projection·Worker 집중 Node 20개와 Debug·ReleaseSafe·ReleaseFast 제품 편집 검사 각 47개가 통과했습니다.

agent-browser로 공개 Chromium 화면의 실제 software 문단 33을 탭 뒤 좌표로 클릭했습니다. 표시 caret `0:33:1`, `한😀` 입력과 native 확정 대체 텍스트, Backspace 이모지 삭제, Home/Delete 탭 삭제 거부 및 복원, End 후 `끝` 입력을 확인했습니다. 오류 목록은 비어 있었고 `/private/tmp/hwpjs-software-tab-input.png`에서 caret와 텍스트를 확인했습니다. 실제 OS IME 후보창·모바일·Safari/Firefox·원본 조판 검증이 아닙니다.

실행 명령은 [개발 명령](development-commands.md)이 소유합니다. 표·도형·하이퍼링크의 원문 위치와 전체 문서 범위 편집은 남아 있습니다.
