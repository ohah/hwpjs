# Title의 선택된 ChartText·ChartSection 코어

## 구현 범위

[Title 본문 조사](hwp5-chart-title-body-evidence.md)의 연속 구간을 Zig 코어에 연결했습니다. `title.readObservedV1`은 inline Title v1 헤더와 선택된 ChartText·ChartSection 본문을, `readBodyObservedV1`은 이미 검증한 헤더 다음 본문만 읽습니다. 뒤쪽 List/Window 후보 78바이트는 소비하지 않습니다. 일반 Title·Chart의 모든 버전·필드를 해석한 구현이 아닙니다.

본문은 ChartText v1 기반 타입 → inline nullable TextBlock v2 → ChartSection v1 기반 본문입니다. ChartText·ChartSection에는 별도 ID를 추가하지 않습니다. Picture 데이터는 기존과 같이 null인 경우만 지원합니다. null·빈 String·새 String·별칭을 구분하고, raw26/50/34/4와 Fill suffix word는 복사·보존하며 속성 의미나 예약값 제약을 새로 부여하지 않습니다.

## 책임·호환성·소유권

코어 경로는 `src/hwp5/chart/` 기준입니다.

- `title.zig`: 헤더와 본문 조립, 본문 전용 진입점을 소유합니다.
- `chart_text.zig`: ChartText·TextBlock·ChartSection 조립 순서와 nullable/required 텍스트 분기를 소유합니다. 기존 Footnote는 required 경로를 사용하고, 전체 8개 ID의 교차 중복 검사를 기존처럼 상위 Footnote에서 수행합니다. required 구성 요소만 읽는 함수를 전역 ID 검증기로 사용하지 않습니다.
- `chart_section.zig`: 기존 로컬 경로와 새 전체 객체 범위 경로가 필드 읽기를 공유합니다.
- `backdrop.zig`: 전체 객체 범위용 wrapper가 기존 Backdrop 필드 읽기와 Picture 공통 코어를 재사용합니다. TextBlock의 보조 Backdrop도 이 wrapper를 사용합니다.

Backdrop 내부 중복 ID는 기존 시점과 `UnsupportedChartObjectReference`를 유지합니다. 전체 Backdrop을 검증한 뒤 세 ID를 전역 테이블에 등록하며, 전역 중복은 `DuplicateChartObjectId`입니다. 따라서 전역 중복 ID와 Backdrop 내부 잘림이 동시에 있으면 잘림이 먼저이고, 완전한 Backdrop 뒤 마지막 Section 기반 타입만 잘렸다면 전역 중복이 먼저입니다. 이를 구성 요소별 native 테스트로 고정했습니다.

모든 새 진입점은 실패 시 자신에게 전달된 Reader 위치를 유지합니다. 타입·객체 테이블은 일부 변경됐을 수 있으므로 둘 다 폐기해야 합니다. 전체 그래프의 트랜잭션 복원은 아닙니다. String은 호출자가 유지하는 입력을 빌리고, raw 필드는 값으로 복사합니다. 결과 자체에 별도의 해제 대상은 없고 테이블 수명은 호출자가 관리합니다.

문자열당 제한·한 TextBlock의 이름+본문 합계 제한은 기존 `text_block.Options`를 전달합니다. 전체 객체 수·저장 문자열 총량·타입 수는 공통 테이블이 관리합니다. 별칭도 본문 필드 합계 제한에는 각 사용 위치의 길이로 계산합니다.

## 테스트 경계의 SSOT

테스트 전용 `chart-series-collection-prefix.zig`는 기존 mode 331의 선행 파싱·명시적 Point 수·객체 범위를 그대로 공유하며, 계열 결과와 선행 상태를 함께 정리합니다. mode 331은 기존 출력 계약을 유지하고 새 mode 332는 그 뒤 Title 본문을 대조합니다. `chart-text-body-probe.zig`의 nullable block adapter를 suffix·계열·Title probe가 함께 사용합니다.

mode 332는 Title/Block ID, 각 끝 위치, 타입·객체·String 저장량, 본문 전체 wire, Section·Backdrop 원문을 독립 JS oracle과 바이트 비교합니다. 이 wire의 객체 수는 최종 범위 기준입니다. 일반 사용자용 JS/WASM 문서 API에 자동 Title 라우팅을 추가한 것은 아닙니다.

## 검증 기록

ReleaseSafe 실제 WASM: 차트 43개, 정상·변형 성공 301건, 거부 15,386건. 모든 Title 본문 잘림 13,752건, 객체/크기 제한, null·중복 ID, 타입 참조 817개 변형, non-null Picture 데이터, 정확한 끝·뒤쪽 데이터 무관성·원본 재파싱을 검사했습니다. 실제 문서의 새 Title text를 null·빈 String·Font name 별칭으로 교체한 변형도 통과합니다. 기존 계열 mode 331도 43개 차트/Series 213개/Point 16개(성공 172·거부 148,209)로 대조했습니다.

Native Title 테스트 4개는 전체/본문/Section/Backdrop 진입점의 모든 잘림, 자체 Reader 복원, 전역 등록 실패, 타입·ID·제한·오류 우선순위, OOM·명시적 안전 할당자 정리를 포함합니다. 합성 입력은 offset 0/1/17/257, 신규/기존 타입, ID 0, null/빈/새/이전 String/Font name 별칭, 새/기존 Font name, 보조 Backdrop 유무를 조합합니다. 기존 Footnote에는 required 경로의 문자열당·합계 제한 거부 테스트를 추가했습니다.

코어 결함 13종(네 구성 요소의 조기 Reader 변경, Section 길이 과소비, Picture raw 삭제, 전역 등록 삭제·범위 우회, nullable/required 제한 전달 누락, 전역 등록 순서 변경, Footnote 교차 ID 검사 삭제, ChartText 버전 변경)을 세 모드에서 주입했습니다. 39개 모두 컴파일 성공 후 실제 테스트 실패·종료 코드 1로 검출했습니다. 로그는 `/tmp/hwpjs-title-core-mutants.aVcpzm`입니다.

공유 prefix의 계열 해제를 제거한 변형은 실제 차트에서 만든 9,896바이트 테스트 입력으로 별도 native 안전 할당자를 사용해 검사했습니다. 정상은 세 모드 모두 해제 후 0바이트, 변형은 7,248바이트 잔류로 실패했습니다. Title 헤더 마지막 바이트를 잘라 실패시키고 선행 상태의 오류 해제를 제거한 두 번째 변형은 세 모드 모두 12,910바이트 잔류로 실패했습니다. 정상 오류 경로의 잔류는 0바이트입니다. 두 변형 모두 컴파일 성공 후 종료 코드 1이며, ReleaseFast에서도 `safety=true` 할당량을 직접 검사했습니다. 이 두 가지를 포함하면 검출한 결함은 15종입니다. 임시 harness/로그는 `/tmp/hwpjs-title-prefix-ownership.LkFBMa`에 있습니다.

호스트 예외도 별도로 주입했습니다. 같은 메시지의 WebAssembly.RuntimeError·TypeError·RangeError는 정상 거부로 집계되지 않고 AssertionError로 실패하며, 정상 출력 wire 변형도 검출됩니다. 관련 조사 테스트 53개가 통과했습니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 종료 코드 0으로 완료됐습니다. 각 모드에서 27/27 단계, native 1,073/1,073개, WASM 검사 8,864,319회, imports 0입니다. 로그는 `/tmp/hwpjs-title-core-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. source/probe를 고정한 상태에서 순차 실행했고 mode 332의 검증은 정규 audit에 포함합니다.

마지막으로 `zig build test --summary all`의 native 1,073개와 `zig build -Doptimize=ReleaseSafe --summary all`의 5/5 단계 성공을 다시 확인했습니다.

## 남은 범위

뒤쪽 78바이트, 계열 raw106의 필드 의미, 표본 밖 버전·자동 배열 형태 선택, 전체 Chart 모델·렌더링·편집·저장은 미완료입니다. 이 단계의 성공을 전체 문서 파서 완료로 해석하지 않습니다.

다음 후보를 읽기 전용으로 확인했습니다. 43개 모두 다음 inline ID가 기존 범위와 충돌하지 않고, VtList v1 → VtCollection v1 → raw word → VtObject v1까지 29바이트입니다. 이어 raw26을 보존하고 VtWindow v2 → VtObject v1 → raw word를 읽으면 23바이트를 소비하여 Contents 끝에 도달합니다. 두 word는 표본 모두 0입니다. 아직 잘림·참조·버전 변형 검증을 하지 않았으며, word의 개수 의미나 raw26의 소유 관계를 확정하지 않습니다.
