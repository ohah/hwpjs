# 표 번호 참조가 있는 구역의 일반 텍스트 편집

## 계약과 책임

선택 구역에 로컬 표 번호/이름 상호참조가 있더라도 결과 영역 밖의 일반 텍스트를 splice할 수 있습니다. 기존 대상 부재와 저장된 결과 문자열은 그대로 보존합니다. 번호·개체 ID를 재생성하거나 표시 결과를 재계산하지 않습니다. 다른 구역의 정책은 [비대상 참조 보존](hwp5-unselected-table-number-text.md)을 따릅니다.

`source_policy.validateFieldTextTransaction`은 레코드/참조 종류만 검사합니다. 공개 적격성 조회는 별도 필드 연결 검사를 수행하고, 실제 `field_splice`는 모델 거래 안에서 바인딩·제어 경계·기존 `field_result_protection`을 적용합니다. 필드 연결에서 문단 검증으로 다시 진입할 수 있으므로 source policy에서 연결 검사를 재귀 호출하지 않습니다.

`cross_reference_name_apply.applyDraftRetainingTableNumbers`는 공통 의미 판정으로 로컬 표 번호만 건너뛰고 기존 책갈피 이름 결과는 원래 경로로 처리합니다. 기존 일반 결과 적용 API와 수식 정의·문단 분할/병합의 허가는 변경하지 않습니다. 외부 문서·페이지·대상 텍스트·상대 위치는 계속 거부합니다. 파생 결과 영역은 삽입 시작/끝 경계와 결과 삭제를 포함해 `ReadOnlyCrossReferenceResult`로 보호합니다.

## 분리 후보 검증

게시 후보 WASM SHA256은 `59235b1263465c623ec2c9ef338edee9b5b2ca705103f97b324f0a14eefbc7c4`입니다. main1bdd5324 이전 제품 소스와 같은 main4bc5b261에서 해당 제품 변경과 최종 주석을 적용해 ReleaseSafe5/5 재빌드했습니다. 이후 main의 두 커밋은 테스트·문서 변경이며 제품 코드는 동일합니다. 초기 검사/브라우저 후보는 `f66a6e363deaf59642e77dbbd117f35576542757b4e7948680165acb1796dc10`이며 새 산출물과 검증 기록을 구분합니다.

실제 `hwpspec.hwp`의 2/3번 구역과 실제 HWP5인 `hwp-3.0-HWPML.hwp`의 2번 구역에서 일반 입력·독립 전체 Section/비대상 stream·저장 재열기·undo/redo를 검사했습니다. 독립 레코드/UTF16 스캐너의147개 참조 시작·끝294지점에서 입력을 거부하고 기존 redo를 유지했습니다. 결과 문자열 삭제와 문단 분할/병합도 거부하며, 외부/페이지/텍스트/상대 위치 반례와 실제 roadmap 보호를 유지합니다.

API·수식 정의·기존 Canvas와 새 두 구역 Canvas를 합친 묶음은24/24·fail/skip0입니다. 실제 참조 문단 파생 입력의 source policy와 모델 splice/저장/재열기에 전체 부분 할당 실패를 주입한 native 집중 검사는 ReleaseSafe2/2·Debug2/2·exit0입니다. 로그는 `/tmp/hwpjs-selected-table-number.VuYP69/selected-combined-regressions.log`, `selected-native-allocation.log`, `selected-native-debug.log`입니다. 모든 명령의 실패 원자성이나 전체 native 완료를 뜻하지 않습니다.

## 실제 브라우저의 남은 확인

최종 주석까지 반영한 게시 산출물은 `publication-regressions.log`의 단일 명령27/27·fail/cancel/skip0·exit0으로 재검증했습니다. 이름/종류 기준 export331개도 추가/제거 없이 동일합니다. `publication-reader-parity.jsonl`의 reference975개는 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26입니다. 입력 hash도 함께 대조했으며 같은 거부는 지원 성공이 아닙니다. 물리 fixture/baseline을 갖춘 HWPX 전체 실행은 별도로 진행 중이고, 시작만으로 완료로 기록하지 않습니다.

통합24개 실행 이후 새 Canvas 검사를 각 구역의0/1번 문단으로 확장해4/4·fail/skip0을 별도로 확인했습니다(`selected-canvas-four-paragraphs.log`). 실제 브라우저에서 선택한2/1 문단도 포함하지만, DOM 대역4개를 실제 Chromium 이력 갱신의 대체 증거로 사용하지 않습니다.

격리 Chromium에서 원본 업로드·보정본 동의·찾기의 세 번째 결과(표시상 구역3/문단2, native2/1) 선택·Home·한글/이모지 입력창 반영을 확인했습니다. 하지만 실행 취소 후 입력창의 기존 문자열이 유지되는 징후를 관측했고, 저장 동의 checkbox의 가림과 agent 다운로드 대기 때문에 독립 다운로드 원문 대조를 완료하지 못했습니다. native 이력 실패로 원인을 확정하거나 E2E 통과로 보고하지 않습니다. DOM 대역의 성공과 이 실제 브라우저 미확인 경계를 합치지 않습니다.

스크린샷 `selected-browser-section2.png`, `selected-browser-edited.png`와 같은 후보 폴더에 진단을 보존했습니다. 브라우저 세션 `hwpjs-selected-table-number-35c54947528a`는 close 후 active=false/pid=null, 소유 서버58851도 종료했습니다. 기본 제품 WASM과 외부 데모는 교체하지 않았습니다.

## 재현 명령

`HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/selected-table-number-text.test.mjs tests/hwp5/selected-table-number-canvas.test.mjs tests/hwp5/unselected-table-number-text.test.mjs tests/hwp5/unselected-cross-reference-gate.test.mjs tests/hwp5/table-number-character-format.test.mjs tests/hwp5/normalized-distribution.test.mjs tests/hwp5/table-number-format-canvas.test.mjs tests/hwp5/formula-definition-editor.test.mjs`

`zig test src/root.zig -O ReleaseSafe --test-filter 'table number character format source validation cleans every partial allocation'`와 Debug로 검사합니다. 전체 픽스쳐 편집·번호 재계산·원본 조판 동치는 별도 목표입니다.
