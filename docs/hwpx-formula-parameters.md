# HWPX 계산 필드 편집과 저장

## 현재 범위

관측된 FORMULA 필드의 SUM/AVG 사각 참조와 `%g`/`%.2f` 출력을 지원합니다. native Session.splice는 현재 숫자 문자열을 임시 복사해 편집·재평가·출력 준비 검증 뒤 반영합니다. Session.save는 현재 문자열에서 결과 라벨·Command 저장 결과·LastResult·dirty를 함께 유도합니다. 영속 계산 결과 캐시를 별도로 두지 않습니다. 공개 WASM과 기존 Worker/Canvas는 이 native 경로를 사용합니다.

결과·현재 라벨·두 저장 결과가 이미 같으면 변경안을 제외합니다. 비교는 사이트 경계를 합쳐 수행하므로 무변경 저장 때문에 run 서식을 합치지 않습니다. dirty는 실제 변경 필드에만 설정하며 기존 다른 필드의 수정 속성도 보존합니다.

## 책임과 소유권

- `formula_parameters.zig`: 기존 [파라미터 보고서](hwpx-parameter-lists.md)의 직접 stringParam 연결. null/빈 값 구분, 중복 루트·이름·잘못된 타입 거부. View 문자열은 보고서를 빌립니다.
- `formula_expression.zig`: UTF-8 경계 변환과 기존 HWP5 envelope/range/format 연결. Command와 Formula 일치 확인. 반환 참조·enum은 임시 버퍼를 빌리지 않습니다.
- `formula_cell_owner.zig`: 가장 가까운 tc와 직접 tr/tbl, 유일 주소·표 크기 연결.
- `formula_cell_number.zig`: 현재 Sites의 숫자 읽기. 중첩 셀 제외, 빈 문단 포함 두 번째 문단·문단 내부 컨트롤·128 UTF-8 바이트 초과 거부. 숫자 문법은 HWP5 코어를 재사용합니다.
- `formula_values.zig`: 직접 셀 조회·범위 평가·셀/검사 예산. 누락·모호한 중복·병합 참조·잘못된 span·비유한 합 거부.
- `formula_output.zig`: 관측 ResultFormat의 쉼표를 천 단위 그룹으로 연결. Command 형식과 불일치·부재·미지원 형식을 거부하며 렌더링은 HWP5 코어를 재사용합니다.
- `formula_result_sites.zig`: 기존 필드 링크가 검증한 원문 범위의 결과 사이트 교체안. 중첩 필드·탭·비텍스트 요소·교차 문단 사이트 거부.
- `formula_parameter_changes.zig`: 동일 원본 바인딩에서 Command/LastResult 교체안. 현재 단순 scalar 본문만 지원하며 CDATA·주석·자식·자기 닫힘은 거부합니다.
- `formula_field_output.zig`: 소유 준비안과 임시 Site 배열로 다중 필드를 한 번에 출력. 중복 결과 사이트 거부. Prepared는 결과 문자열과 Command를 소유하며 deinit이 필요합니다.
- `formula_section_prepare.zig`: 구역·FORMULA type·기존 전체 링크·활성 frames·평가/출력 조립. 시작/끝 활성 상태 불일치 거부. 필드 수 예산은 변경 없는 필드도 계수합니다.
- `formula_section_save.zig`: 계산 필드 없는 구역은 기존 저장기, 있는 구역은 현재 계산 준비안 연결.
- `formula_splice.zig`: 임시 소유 문자열 거래와 성공 뒤 infallible swap. 실패 시 현재 문자열을 보존합니다.

`text_sites_save.writeWithChanges`는 같은 불변 Tree 좌표의 매개변수·현재 텍스트·dirty 변경을 정렬해 기존 XML writer에 전달합니다. 중간 XML 재파싱으로 오프셋을 바꾸지 않으며 겹침은 거부합니다.

## 실측 검증

독립 저장 oracle의 적대적 반례: LastResult·dirty·라벨·다른 ZIP payload를 각각 손상한 출력 4개가 일반 Python과 `-O` 모두에서 거부됐습니다. 반례 생성기의 ZipInfo 재사용으로 원본 header_offset이 바뀌던 오류는 `copy.copy`로 분리해 수정했습니다. 수정 뒤 최신 제품 HWPX audit 18/18·빌드 7/7이 통과했습니다.

공개 숫자 편집 전수: chart에서 비숫자 prefix가 거부되는 실제 48개 입력 문단을 각각 `100`으로 바꿔 저장·재열기·재저장하고 각 출력의 계산 필드 13개를 독립 ElementTree/Decimal로 확인한 formula-editor 검사 2/2가 통과했습니다. 총 624개 결과의 LastResult·Command·라벨 일치를 비교합니다. 고정 소수점은 관측 %.2f 정책으로 비교하며 임의 locale/일반 printf 검증은 아닙니다.

구역 합산 예산·fixture 테스트 파일 분리를 포함한 최신 전체 ReleaseSafe native 검사 2777/2777·빌드 7/7이 통과했습니다. 최신 계산 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 14/14 통과했습니다. Worker/공개 API 집중 검사 5/5에서 숫자 편집 뒤 의존 라벨 갱신·잘못된 숫자 거부·원래 숫자 복원 뒤 라벨 복원을 자동 검사했습니다.

최신 제품 HWPX audit 17/17·빌드 7/7 통과 후 임의 prefix 전수 검사는 45개 파일(암호화 1개 별도), 1379문단에서 1166개 삽입/저장/복원 성공, 165개 UnsupportedParagraphControl, 48개 InvalidFormulaNumber로 종료했습니다. 마지막 48개는 편집 가능한 숫자 입력에 의도적으로 비숫자 prefix를 넣은 거부이며 전체 숫자 편집 불가 판정이 아닙니다. 모든 거부 뒤 원본 ZIP 유지를 검사했습니다. 실제 파일·ZIP 통합 반례는 `formula_fixture_tests.zig`에 분리합니다.

계산 기반 집중 검사 ReleaseSafe/ReleaseFast 13/13에서 실제 chart.hwpx 13개 정의·셀 수·기대 숫자·표시 문자열, 누락/중복/병합 참조, 형식 불일치, 다중 결과/parameter/dirty 출력·ZIP 재열기를 확인했습니다. 후속 거래 검사는 별도입니다.

`tools/hwpx-formula-cell-oracle.py`는 독립 ZIP/ElementTree/Decimal로 13개 숫자와 셀 수를 산출합니다. 일반 Python과 `-O`에서 실행했고 native 기대값과 절대 오차 1e-9 이내·정확한 셀 수로 비교합니다. LastResult는 계산 입력으로 사용하지 않습니다. 해당 단순 fixture용이며 일반 오류 문서 판정기는 아닙니다.

작은 두 셀의 거래 할당 실패 전수 검사는 ReleaseSafe/ReleaseFast 각각 2/2 통과했습니다. 실제 chart native 세션 집중 검사 2/2에서 `11.2 → 100` 편집·저장·재열기 결과 `156.3`, `bad` 거부 후 저장 결과 유지, 무변경 원본 ZIP·재저장 바이트 일치를 확인했습니다. 이는 실제 chart 전체 ZIP 거래의 모든 할당 실패 전수는 아닙니다.

제품 ReleaseSafe WASM 빌드 5/5, 공개 편집·Worker 검사 14/14가 통과했습니다. 별도 formula-editor 검사는 독립 Python으로 13개 필드 유지·첫 결과 라벨/Command/LastResult/dirty 일치·다른 ZIP payload 보존을 확인합니다. Oracle의 바깥 표 포함 문단 선택 오류는 가장 가까운 부모 문단으로 수정했습니다.

실제 Chromium 외부 접속 E2E에서 chart 문단 20의 `11.2 → 100` 입력 뒤 문단 24 결과 `156.3` 갱신과 `bad` 거부 후 복원을 확인했습니다. 캡처는 `/private/tmp/hwpjs-hwpx-formula-e2e.png`입니다. agent-browser 포인터/inserttext 검증이며 실제 OS 한글 IME 증명은 아닙니다.

## 남은 제한

구역 안의 평가 셀 수·검사 예산은 모든 활성 계산 필드가 공유합니다. 숫자 projection의 전체 XML/Sites 방문 비용도 진입 전에 계수합니다. 각 수식은 4셀 이하인 실제 chart에 구역 4셀 예산을 주면 전체 준비가 LimitExceeded로 거부되는 반례를 추가했고 최신 ReleaseSafe 계산/거래 집중 검사 14/14가 통과했습니다. 이 예산은 전체 XML 파싱/링크/부모 순회 시간의 정확한 계측이나 문서 전체 구역 간 합산 예산은 아닙니다.

계산 필드 간 의존/순환 평가, 선택된 셀 내부 비활성 markup 처리, 일반 계산식 문법은 미완료입니다. 한 구역의 기존 미지원 계산 정의 때문에 다른 문단의 편집·저장도 거부될 수 있습니다. 계산 라벨은 현재 원본 Sites를 직접 변경하지 않고 저장·Worker 재투영에서 유도합니다.

ZIP metadata 원시 바이트 전체의 독립 대조, 실제 한컴 열기, 원본 표/쪽 조판, 일반 구조 편집·실행 취소는 이 기능의 검증 범위 밖입니다. 전체 native 회귀 통과도 이러한 미완료 기능의 증명은 아닙니다. 명령의 단일 출처는 [개발·검증 명령](development-commands.md)입니다.
