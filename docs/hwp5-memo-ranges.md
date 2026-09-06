# 메모 범위 진단

[필드·메모 계약](hwp5-fields-contracts.md) · [문단 흐름](hwp5-paragraph-flows.md)

## 책임과 입력

`body/memo_ranges.zig`는 명시적으로 식별한 메모 시작·끝 이벤트를 받아 LIFO 짝 진단을 반환합니다. 이벤트는 원본 구역 인덱스, 리스트 scope, 문단 노드, UTF-16 위치와 시작의 선택 번호 또는 끝 번호입니다. 일반 필드 instance ID나 DocInfo 모양 번호를 받지 않습니다.

입력 배열을 복사하여 흐름/위치 순으로 정렬하고 원본을 변경하지 않습니다. 같은 흐름·구역·문단·위치의 중복은 `DuplicateMemoRangePosition`이며 임의의 순서를 선택하지 않습니다. 임시 배열과 스택은 관측 이벤트 수에 비례하며 성공·실패 모두 해제합니다. 반환 보고서는 scalar만 소유합니다.

## 진단 정책

- root scope 0은 구역을 넘어 연결할 수 있습니다. 리스트 scope는 구역과 리스트 노드의 조합으로 격리합니다. 이는 코어의 명시적 정책이며 실제 구역 간 메모 범위가 확인되었다는 뜻은 아닙니다.
- 끝 이벤트는 스택의 마지막 시작만 꺼냅니다. 번호가 다른 경우 스택 안에서 일치하는 번호를 검색하여 교차를 숨기지 않습니다.
- `pairs`는 구조적으로 짝지은 수입니다. 번호가 다른 짝은 `id_mismatches`, 시작 번호가 없는 짝은 `unindexed_pairs`로 별도 집계합니다. null을 0으로 바꾸지 않습니다.
- 다른 흐름의 끝으로 미닫힘 시작을 상쇄하지 않습니다. `starts = pairs + unclosed_starts`, `ends = pairs + orphan_ends`입니다.
- 구역이 다르면 문단 노드 번호가 같더라도 `cross_paragraph_pairs`입니다.

## 명세와 미완료 경계

명세 4.3.10.15의 공통 필드와 4.3.2의 원본 텍스트 위치를 참고했습니다. 메모 선택 번호와 끝 표식은 별도 관측 형식이며 공통 명세가 전체 메모 중첩 의미를 정의한다고 주장하지 않습니다.

이 코어는 **문서 보고서에 연결된 진단이며 범위 이상을 강제 오류로 처리하지 않습니다**. 현재 전역 번호→리스트 검사는 계속 별도의 `memo_references` 책임입니다. 관측 밖의 끝 표식, 모든 필드 종류의 범위, 교차/중첩 허용 의미와 렌더링/편집은 남아 있습니다. 일반 코드 4나 미지 표식을 메모 끝으로 추측하여 닫지 않습니다.

## 문서 수집·보고서 연결

`body/memo_range_collection.zig`는 문서 수명의 이벤트 배열과 구역별 임시 시작 목록을 소유합니다. field_validation은 이미 파싱한 memo_field 결과의 선택 번호와 컨트롤 노드를 전달합니다. memo_end_collection은 기존 Text.Iterator/memo_end 결과의 끝 번호·문단 부모·UTF-16 위치를 함께 전달합니다. 공통 필드나 끝 토큰을 다시 파싱하지 않습니다.

section은 기존 Tree/Groups/Links를 전달합니다. 관측 이벤트가 있는 구역에서만 Flows를 만들고, 원본 노드 순서의 시작 목록을 이진 검색하여 각 Link의 위치와 결합합니다. Links가 전역 control_node 순으로 정렬되어 있다고 가정하지 않습니다. 시작 목록의 역순/중복, 누락/중복 링크와 잘못된 구역 경계는 수집 계약 오류입니다. 실패 후 수집기를 재사용하는 트랜잭션은 제공하지 않으며 문서 호출의 defer가 부분 결과를 해제합니다.

document.validation이 구역 검사 및 기존 번호 참조 검사 후 범위 진단을 수행합니다. `document.Report.memo_ranges`는 9개 scalar이며 원문/임시 Tree를 빌리지 않습니다. container도 이 문서 보고서를 소유합니다. 테스트 mode 94는 decoded 문서 입력 경로를 공유하고 이 9개 값만 반환합니다. 기존 mode 24/25 및 90/92 wire와 제품 JS ABI는 바꾸지 않습니다.

## 검증 구성

`body/memo_range_tests.zig`는 순서 반전·반복 검사, root 구역 간 연결, 다른 구역의 동일 리스트 키 격리, 다른 리스트 격리, 중첩/교차/고아/미닫힘, null/0/최댓값, 중복 위치 및 모든 할당 실패를 검사합니다. 길이 7의 시작0/시작1/끝0/끝1 조합 16,384개는 제품 스택을 사용하지 않는 역방향 깊이 계산과 대조합니다. 이는 해당 이벤트 계약의 검증이며 전체 HWP 지원 증거가 아닙니다.

## 2026-09-07 독립 코어 단계 실측

- 최종 소스의 Debug `zig build test --summary all`: 248/248 통과. `/tmp/hwpjs-memo-ranges-final-native.log`.
- Debug 전체 audit: 네이티브 247/247, Node 47, 기존 HWP5 WASM 1,370,253건, CFB 변형 12,000건/trap 0. 실행 도중 추가한 전수 조합 테스트는 이 실행에 포함되지 않아 위 최종 네이티브 검사로 따로 확인했습니다. `/tmp/hwpjs-memo-ranges-debug.log`.
- ReleaseSafe/ReleaseFast 전체 audit: 각각 네이티브 248/248, Node 47, 기존 HWP5 WASM 1,370,253건, CFB 변형 12,000건/trap 0. `/tmp/hwpjs-memo-ranges-safe.log`, `/tmp/hwpjs-memo-ranges-fast.log`.
- 새 범위 코어는 이번에 네이티브로 검증했습니다. 위 기존 WASM/실제 파일 회귀 수치를 새 범위 수집·통합 검증으로 해석하지 않습니다. `/tmp` 로그는 로컬 실행 증거이며 저장소 배포 산출물이 아닙니다.

## 문서 연결 단계 검증 구성

- 실제 파일 6개/41개 구역의 28쌍을 mode 94로 검사합니다. 문단을 넘는 1쌍을 포함하며 구역 입력 순서를 반전해도 결과가 같습니다. 구역 간 target 참조와 구역 간 범위는 구분하며 실제 범위의 구역 간 쌍은 0입니다.
- `tests/hwp5/memo-ranges.mjs`의 독립 수집기는 원시 레코드 레벨·리스트·제어문자·MEMO 명령/꼬리를 읽습니다. 제품 Links/Flows/memo-field/memo-end probe로 기대 이벤트를 생성하지 않습니다. 이 oracle의 MEMO 명령 가정은 선택한 실제 표본용이며 제품 파서의 지원 규칙이 아닙니다.
- 기존 대상 번호가 존재하는 끝 번호 둘을 교환하면 범위 불일치 2건입니다. 시작·끝 위치를 교환하면 고아 끝/미닫힘 각각 1건입니다. 관측 끝 표식을 미지 값으로 변경하면 시작 1개가 미닫힘으로 남습니다. 세 입력 모두 기존 참조 검사와 mode 24는 통과하고 기존 mode 24 바이트 보고서도 유지됩니다. 범위 진단이 없던 경로의 한계를 보여주는 재현입니다.
- 선택 시작 번호를 제거하면 `unindexed_pairs=1`이며 0으로 보정하거나 불일치로 세지 않습니다. 각 변형 뒤 원본을 다시 검사하여 상태 누출을 확인합니다.
- 네이티브 수집 테스트는 두 문단/두 구역, 역순 Link 배열, 전체 할당 실패 및 누락/중복 링크·시작 순서·경계 오류를 포함합니다. 16,384개 코어 조합 대조는 그대로 유지합니다.

## 참조 구현 확인

로컬 rhwp `e8800c8de`의 `src/parser/body_text.rs`는 문단 텍스트의 일반 필드 시작/끝을 스택으로 연결하고, `link_orphan_field_ends`에서 문단을 넘는 미연결 끝에 앞선 필드 instance ID를 채웁니다. 이 경로의 스택 사용은 확인했지만, 그것이 모든 메모 교차 범위의 공식 허용 규칙을 증명하지는 않습니다. 여기의 메모 번호 진단은 일반 field instance ID 연결과 다른 축이며 rhwp의 0 대체/일반 필드 연결을 그대로 이식하지 않았습니다.

## 2026-09-07 문서 연결 단계 실측

최종 Debug/ReleaseSafe/ReleaseFast `zig build audit --summary all`(각 optimize 옵션) 모두 네이티브 250/250, Node 47/47, HWP5 WASM 1,370,333건을 통과했습니다. CFB 변형 12,000건/trap 0이며 새 실제 파일 6개 대조와 4개 변형 검사가 포함됩니다. 코드 포맷·변경 JS 문법·문서 링크·diff 검사도 통과했습니다.

로그는 `/tmp/hwpjs-memo-range-integration-final-debug.log`, `/tmp/hwpjs-memo-range-integration-safe.log`, `/tmp/hwpjs-memo-range-integration-fast.log`입니다. 이 결과는 관측 메모 범위 수집/진단의 연결 증거이지 전체 필드 문법이나 전체 HWP/HWPX 지원 완료의 증거가 아닙니다.
