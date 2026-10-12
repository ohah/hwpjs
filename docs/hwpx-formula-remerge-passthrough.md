# 계산식 재병합과 원본 줄 배치 보존 경계

## 재현과 원인

2026-10-12 공개 테스트 전체 실행은 WASM `7f310f37d2900794df5aeb2ec2b8df4c95e61f8b49b6e477a6209fadd2e74d26`에서 2,064개 중 2,063개 통과, 1개 실패로 종료했습니다. 실패는 `tests/hwpx/formula-split-editor.test.mjs`의 첫 테스트입니다.

실제 `chart.hwpx`의 숫자 셀을 `100`으로 바꾼 뒤 계산식 문단을 시작 또는 끝 경계에서 분할·재병합하면, 서식 없는 경우 `UnsupportedStructuralFieldEdit`가 발생했습니다. 같은 경계에 부분 서식이 있는 경우에는 병합됐습니다.

`paragraph_structure_save.zig`의 원본과 같은 단일 필드 문단 보존 경로가 계산식에도 일반 필드 검증을 적용했습니다. 이를 계산식 검증으로만 바꾼 중간 후보 `011e07f87416e1e674085c6d4709e59f4864b727e67e4a83dd2681f2e7b7ce19`는 명령 거부를 없앴지만 독립 XML 비교에서 실패했습니다. 실측 차이는 계산식 컨트롤이 아니라 분할 때 제거된 원본 `linesegarray`가 재병합 때 되살아난 것입니다.

## 수정 책임

현재 문단의 소유 마커를 기존 `formula_marker_kind.owned`로 판정합니다. 계산식 소유 문단은 구조 저장의 기존 계산식 재작성 경로를 사용하며, 무관한 일반 필드는 metadata-only 원본 보존 경로를 유지합니다. 마커 검증·계산식 평가·XML writer를 새로 복제하거나 독립 비교기의 요구를 완화하지 않습니다.

## 검증 상태

- 줄 배치 복원을 막은 중간 후보 `65a686c20ee8808d78cf38e12b66a24caeba29584f992e649bbfb18bc5f39dd8`: ReleaseSafe 빌드 6/6, 실패했던 재병합 테스트 1/1 통과. 테스트는 독립 Python 및 `-O` ZIP/XML 비교, 문자별 서식, undo/redo, 재분할, 숫자 재계산, 정의 변경, 재열기를 포함합니다.
- 문단별 소유권으로 범위를 한정한 현재 후보 `77a805aacf1cb3e1fed530ac946154916ce8b6eac6b71d801bc7dcf663e87584`: 포맷 검사 및 ReleaseSafe 빌드 6/6 통과. 계산식 분할, 구조 편집, Worker, 숫자 셀 분할의 결합 회귀는 **72/72 통과, 실패·skip 0, exit 0**으로 종료했습니다(382840.899083ms). 네 테스트 파일은 `formula-split-editor.test.mjs`, `structure-editor.test.mjs`, `structure-worker.test.mjs`, `formula-numeric-split-editor.test.mjs`입니다. 표 비의존 셀 169개 경계, 숫자 셀 157개 경계의 허용 108·보호 거부 49, 계산식 13개 문단의 양쪽 경계 및 독립 XML/ZIP·이력·재열기 비교를 포함합니다.
- 현재 후보의 전체 공개 테스트는 `HWPJS_TEST_WASM=zig-out/verification/formula-remerge-owned/bin/hwpjs.wasm node --test --test-concurrency=2 tests/hwp5/*.test.mjs tests/hwpx/*.test.mjs`로 **2,064/2,064 통과, 실패·취소·skip·todo 0, exit 0**으로 종료했습니다(8143264.669417ms). 이전 전체 실행의 계산식 재병합 실패를 포함한 동일 공개 테스트 범위의 결과이며 전체 참조 문서·브라우저 조판 완료를 뜻하지 않습니다.
- 이전 전체 native 실행은 수정 전 소스 기준으로 정확한 소유 프로세스 확인 후 종료했으며 exit 143입니다. 통과·실패 결과로 집계하지 않습니다. 수정 후 전체 native 실행은 exit 1로 종료했습니다. 3,951/3,956 통과, skip 1, 실패 1, signal KILL 3건과 누수 보고 1건입니다(`/tmp/hwpjs-native-77a805.SZXWvD`). 공개 테스트 통과가 이 실패를 상쇄하지 않습니다.
- 실패한 조립 계산식 저장 테스트를 단독 재현했습니다. SUM이 문자열을 제외하는 기존 [셀 분류 계약](hwpx-formula-cell-scalars.md)과 달리 문자열 입력에 `InvalidFormulaNumber`를 기대했고, 성공 반환 버퍼가 해제되지 않아 누수도 보고됐습니다. 문자열 보존·SUM 결과 0 및 같은 문자열에 대한 AVG 오류 반례로 수정한 집중 실행은 2/2 통과, exit 0입니다. 제품 숫자 입력 전환 guard를 완화하지 않았습니다.
- KILL된 페이지 영역 History 테스트의 원본 단독 실행은 2/2 통과, exit 0입니다. 따라서 전체 실행의 KILL 원인은 미확정이며 원본 테스트의 결정적 실패로 단정하지 않습니다. 원본 단독 실행의 RSS는 약 43GB까지 관측됐습니다. 공통 검사기를 연결한 세 KILL 대상의 집중 재검증 결과는 아래와 같으며, 전체 native 재검증은 아직 진행 중입니다.

공통 검사기 버전의 페이지 영역 History 단독 비교는 이후 2/2 통과, exit 0으로 종료했습니다. `/usr/bin/time -l`은 real 111.73초, maximum resident set size 11,661,279,232바이트를 보고했습니다. 원본 단독 실행에서 관측한 약 43GB보다 낮지만 원본의 최대 RSS를 같은 계측으로 수집하지 않았으므로 정확한 감소율은 주장하지 않습니다. 전체 native의 KILL 원인이 확정되거나 전체 gate가 통과한 것은 아닙니다.

나머지 KILL 대상에 공통 검사기를 연결한 집중 실행은 4/4 통과, exit 0입니다. HWP5 셀 분할 1,427개·병합 1,492개 실패 지점과 HWPX 열 경계 탭 저장·재분할·재병합을 검사했습니다. real 63.04초, 최대 RSS 1,281,835,008바이트입니다. 전체 native 재검증은 `/tmp/hwpjs-native-checked-sweeps.7ZgD3A`에 기록하며 진행 중입니다.
위 전체 native 재검증은 exit 1로 종료했습니다. 3,953/3,956 통과, skip 1, KILL 2건이며 일반 실패와 누수 보고는 없었습니다. 남은 대상은 `column_page_area_source_merge`의 혼합 원본 병합과 `column_boundary_checkpoint_tests`의 최초 입력 소유권 검사입니다. KILL 자체의 원인은 미확정입니다.

두 대상에 공통 전수 할당 검사기를 연결한 집중 실행에서 체크포인트 테스트의 `Invalid free`를 재현했습니다. 문서는 `std.testing.allocator`로 열고 세션 할당자만 다른 할당자로 바꾸어, 편집 시 기존 사이트 버퍼를 잘못된 할당자로 해제한 테스트 소유권 오류입니다. 문서 열기·조회·편집·정리를 같은 실패 주입 할당자로 수행하도록 수정했습니다. 문서 열기 실패 지점도 검사에 포함하며 제품 코드는 변경하지 않았습니다. 수정 후 두 대상과 root의 집중 실행은 3/3 통과, exit 0, real 372.67초, 최대 RSS 1,190,674,432바이트입니다. 전체 native gate는 여전히 미통과이며 다시 검증해야 합니다.

후속 포맷 검사와 ReleaseSafe 제품 빌드는 6/6 단계 통과로 종료했습니다. 이 빌드가 갱신한 로컬 `zig-out/bin/hwpjs.wasm`의 SHA256은 `7b41bb97ffbb2bf77e21a40dd3e88968383a641734c759c956f854408d12ced3`입니다. 이전 `77a805` 공개 테스트 결과를 새 산출물의 결과로 전용하지 않습니다. 최신 소스의 전체 native 재검증은 `/tmp/hwpjs-native-owned-allocators.nzqfqM`, 새 산출물의 전체 공개 테스트는 `/tmp/hwpjs-public-owned-allocators.AcbnLg`에 기록하며 두 실행 모두 아직 진행 중입니다.

새 `7b41bb97` 산출물의 `reference-diagonal-splice.test.mjs` 별도 실행은 3/3 통과, 실패·취소·skip·todo 0, exit 0(44148.842ms)입니다. 독립 oracle의 다중 run 부정 대조와 실제 `charshape.hwpx`의 7조건, `대각선샘플3.hwpx`의 101개 문단에 Unicode를 넣은 파생본의 중간 치환·삭제·끝 삽입 303거래를 검사했습니다. Python normal/-O 전체 XML/ZIP 비교·undo/redo·잘못된 서로게이트 경계 거부 뒤 redo 보존을 포함합니다. 파생본은 추가 원본 픽스쳐가 아니며 참조 전수 prefix 검증을 모든 편집 범위의 성공으로 확대하지 않습니다.

공통 검사기의 부정 대조도 별도로 재실행했습니다. `zig test src/testing/allocation_failures_negative.zig -O ReleaseSafe`는 의도적 누수 3조건에서 각각 정확한 `TestAllocatorLeak`으로 실패하고 정상 버퍼 정리·오류 전파 및 전수 실패 지점/OOM 누락 검사는 2조건 통과하여 exit 1입니다. 성공 반환 뒤 누수와 callback 오류에 가려진 누수를 모두 탐지하는 증거이며, 이 의도된 실패를 전체 native gate의 실패나 통과로 합산하지 않습니다.

이 기록은 전체 픽스쳐 편집·파서·UI 또는 원본 한글 조판의 완료를 의미하지 않습니다. 로컬 기본 WASM은 위 빌드로 갱신했지만 외부 데모 배포와 새 산출물의 실제 브라우저 검증은 아직 수행하지 않았습니다.
