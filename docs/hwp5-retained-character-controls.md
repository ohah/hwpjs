# HWP5 유지 제어문자 회귀

원문 유지 여부와 편집 경계는 `src/hwp5/edit/control_boundaries.zig`가 소유합니다. 공식 본문 제어 표의 코드24 하이픈·30 묶음 빈칸·31 고정폭 빈칸은 원문을 유지하며 주변 텍스트 입력을 허용합니다. 제어 토큰 삭제는 계속 거부합니다. 구조 분할의 허용 범위와 일반 입력의 삭제 범위를 합치지 않습니다. 제목표시8의 ID·payload 검사는 `body/title_mark.zig`로 분리합니다. 상세 기존 계약은 [제어 포함 텍스트 편집](hwp5-control-text-edit.md)을 따릅니다.

## 2026-10-10 실파일 재현

`HWP5-nopassword-123456.hwp`의 구역0/문단5에는 코드24(유닛90)·31(유닛4)이 있으며 원문 header mask는 `0x81000000`입니다. 이전 후보 `a9174618b495bfe29f0a91684a39e35e4e37d3298b5856e73ee72d05faa85f47`의 전 문단 prefix 입력·저장·이력 감사는418시도/417성공·이 문단1개의 `UnsupportedTextControl`였습니다. 코드24가 유지 목록에서 빠진 것이 원인입니다. 신규 실파일 회귀도 이전 후보에서는 같은 오류로 실패했습니다.

코드24 보존을 추가한 후보 `deb854e3c472a0a9ecd18763552a04ac16be41e63ab70cd0ca540811a01170cb`에서는418/418 입력·저장 텍스트·비대상 stream·undo/redo·전체 저장 재열기를 통과했습니다. 문단별 prefix 입력만 검사하므로 모든 범위/객체/조판/브라우저 지원을 뜻하지 않습니다. 원본 픽스쳐는 수정하지 않았으며 기본 제품 WASM도 교체하지 않았습니다.

집중 native 진입점은 `zig test src/control_retention_test.zig -O ReleaseSafe`입니다. 기존 HEAD에 경계 모듈·title_mark·이 진입점만 추가한 별도 Git tree에서도11/11과 ReleaseSafe 빌드를 통과했습니다. 이는 호출 계층 전체나 전수 native 검사 완료가 아닙니다.

로컬 실파일 회귀 `tests/hwp5/hyphen-retention.test.mjs`는 독립 전체 Section/CFB metadata·stream·재열기·이력 및 하이픈 삭제 실패 뒤 redo 보존을 검사했습니다. 이 테스트는 나머지 호출 계층이 연결된 위 후보를 요구하며, 통합 커밋 대상에 남아 있습니다. 경계 모듈 게시만으로 제품 전체 편집 경로가 갱신되지는 않습니다.
