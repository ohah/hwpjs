# 하이픈 표시와 입력 위치

`web/preview/text-offsets.mjs`는 native 코드24·2바이트 토큰을 표시용 U+00AD(소프트 하이픈) 한 UTF-16 단위로 변환합니다. 원문을 ASCII `-`로 바꾸거나 저장 payload를 생성하지 않습니다. 앞뒤 입력 위치가 원문 한 유닛 차이를 유지하며 실제 삭제 여부는 native 경계 검사가 결정합니다. 줄 끝 조건에 따른 하이픈 조판은 아직 별도입니다. 원문 보존 계약은 [유지 제어문자 회귀](hwp5-retained-character-controls.md)를 따릅니다.

2026-10-10 후보 `deb854e3c472a0a9ecd18763552a04ac16be41e63ab70cd0ca540811a01170cb`로 실제 HWP5-nopassword 문단5의 코드24/31 표시·소스 위치·입력 후보·원문 불변을 확인했습니다. 합성 검사는 잘린 표시의 입력 제외, 잘못된 토큰 폭·예약 코드 거부와 모든 앞뒤 경계의 왕복을 확인합니다. 기존 Canvas/공백/제목표시를 포함한4파일16/16·skip0·exit0입니다. 실제 브라우저 입력·IME·원본 조판 동치 검사는 아닙니다. 기본 WASM은 교체하지 않았습니다.

## 후속 Chromium 실제 입력

동일 WASM과 현재 로컬 UI를 별도 loopback 서버에서 검사했습니다. 문단5를 실제 마우스로 클릭하여 caret `0:5:0`·Canvas 입력 focus를 확인하고 `브라우저😀` 입력·undo·redo를 수행했습니다. 찾기로 Word 끝(유닛90)의 하이픈 앞에 이동해 Delete를 누르면 `UnsupportedControlDeletion`로 거부되고 원문 U+00AD와 redo가 보존됐습니다. 오류 목록은 비어 있었지만 원문 페이지 배치의 `UnsupportedHwp5DrawingObjectExtension` 경고는 남습니다. OS IME·원본 조판 완료가 아닙니다. 소유 브라우저 세션과 임시 서버는 각각 종료했습니다.

이 조사에서 거부 후 커서가91로 이동하는 UI 오류를 재현했습니다. 원인은 실패 복원이 입력 직전 선택 대신 삭제 변경 범위를 사용한 것입니다. 로컬 canvas-editor는 이미 보유한 beforeSelection을 재사용하도록 수정했습니다. 전진/후진 삭제·역방향 선택의3반례는 수정 전 실패했고, 수정 후 전체 Canvas179/179·skip0·exit0을 통과했습니다. Chromium 재검사에서도 거부 후 caret/선택90:90·원문 하이픈을 확인했습니다. 해당 controller/test 통합은 아직 미커밋이며 이 기록의 게시가 기본 데모 WASM 또는 전체 UI 게시 완료를 뜻하지 않습니다.
