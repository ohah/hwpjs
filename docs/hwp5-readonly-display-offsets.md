# HWP5 읽기 전용 표시 좌표

`displayContent`의 `sourceOffsets`는 완전한 retained text의 표시/원본 UTF16 경계 매핑입니다. 편집 허용 여부와 별개의 파생 표시 데이터이며, clipped text나 지원하지 않는 control 해석에 좌표를 만들어 채우지 않습니다. `readOnly`를 해제하거나 native 편집 권한을 부여하지 않습니다.

기존 구현은 매핑을 `editable` 조건에 묶어 readOnly 표시에서 표/도형 anchor의 원본 좌표가 사라졌습니다. 실제 table-caption host의 매핑이 undefined가 되는 반례를 재현한 뒤 조건을 수정했습니다.

`node --test --test-concurrency=1 tests/hwp5/readonly-source-offsets.test.mjs`는 기본 WASM으로 실제 table-caption·textbox·sample-5017-pics의 readOnly 파생 전체 표시에서 좌표 일치·모든 문단 비편집·표 anchor 부착·원문 저장 불변을 검사합니다. 기존 API만 사용하며 새 필드 조회 후보나 window Worker에 의존하지 않습니다. 1/1·skip 0·종료코드 0입니다. 실제 배포/암호 문서 전수 및 브라우저 조판 검증은 별도입니다.
