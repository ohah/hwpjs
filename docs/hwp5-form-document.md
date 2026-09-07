# 문서·구역·CFB의 양식 진단 통합

[문서 계약](hwp5-document-contracts.md) · [양식 조립](hwp5-form-controls.md) · [토큰 연결](hwp5-form-links.md) · [관측 스키마](hwp5-form-schema.md)

## 선택과 책임

`document_validation.Options.forms`가 null이면 기존의 양식 미해석 정책을 유지합니다. `.forms = .{}`이면 관측 UTF-16 속성 해석을 명시적으로 선택하고, `form_control.Options`의 양식 수·속성 예산을 지정할 수 있습니다. CFB 진입점은 `container_validation.Options.document.forms`로 같은 선택을 전달합니다. 버전 번호만으로 미확인 속성 길이 모델을 자동 선택하지 않습니다.

`document/section.zig`가 이미 생성한 본문 Tree와 `control_links.Links`를 `body/form_validation.inspect`에 전달합니다. 컨테이너가 양식 파서를 따로 구현하거나 같은 Section을 다시 decompress하지 않습니다. 기존 `form_links.collectObservedUnits`와 새 `collectWithLinksObservedUnits`는 같은 내부 대응 함수를 공유합니다. 새 함수의 Links는 같은 변경되지 않은 Tree에서 생성한 결과여야 합니다.

선택한 경로의 책임은 기존 모듈에 위임합니다: 컨트롤/태그 91 소유 관계와 envelope·속성 Tree는 form_control, 토큰 코드·노드 대응은 form_links, 직접 속성 경로·자료형·중복은 form_schema, 저장된 글자 모양 ID의 범위는 form_references입니다. form_validation은 선택·수치 진단·임시 결과 수명만 조립합니다. 명세 스킬의 컨트롤 헤더·글자 모양 파트를 참조하되 관측 양식 규칙을 공식 표와 혼합하지 않습니다.

## SectionReport.forms

보고서는 모두 usize 수치이며 원본 Section이나 임시 Form/Property/Link 배열을 빌리지 않습니다. 중간 결과는 해당 구역 검사 안에서 해제합니다.

| 필드 | 의미 |
|---|---|
| controls / objects | `form` CTRL_HEADER / 태그 91의 원시 개수 |
| unselected_controls / unselected_objects | 미선택으로 양식 검사하지 않은 각 개수 |
| inspected_forms | 선택 경로의 연결·속성 문법·관측 스키마 검사를 거쳐 보고된 양식 수 |
| unknown_types | 첫 타입 ID가 미지인 양식 수 |
| property_bytes / property_nodes | 소비한 속성 바이트와 Tree 노드 수 |
| known_property_nodes / deferred_property_nodes | 관측 스키마가 인식한 노드 / 미해석 노드 |
| char_shape_valid / char_shape_invalid | 인식한 저장 CharShapeID가 범위 안 / 범위 밖인 수 |
| char_shape_absent | 알려진 양식 종류에서 인식된 CharShapeID 경로가 없는 수 |
| char_shape_deferred | 미지 양식 종류여서 저장 참조를 해석하지 않은 수 |

미선택이면 원시 개수와 unselected 개수만 기록하고 양식 소유 관계·payload 문법·스키마를 새로 검사하지 않습니다. 다른 문단/토큰/리소스 검사는 계속 적용되므로 임의의 손상 Section을 허용한다는 뜻은 아닙니다. 선택한 경우 양식 검사 오류가 문서와 CFB 진입점까지 전파되며 부분 문서 보고서를 반환하지 않습니다.

`inspected_forms`에는 속성 문법까지 읽었지만 타입과 의미는 모르는 양식도 포함되므로 전체 의미 검증 성공 수가 아닙니다. 미지 타입은 별도 unknown/deferred 카운터로 남깁니다. 범위 밖 저장 참조는 `char_shape_invalid` 진단이며 자동 오류로 승격하지 않습니다. `FollowContext`에 따른 활성 참조 여부를 아직 결정하지 않기 때문입니다. 음수/오버플로 등 명시적 저장-ID 해석 오류는 기존 참조 파서 계약대로 반환합니다.

일반 control_types의 `form` deferred 분류나 ParameterSet 등 다른 모듈의 미해석 진단을 양식 검사 성공만으로 제거하지 않습니다. 제품 공개 JS ABI는 변경하지 않았습니다.

## 문서 전체의 공유 예산

선택된 `max_forms`, `properties.max_input_bytes`, `properties.max_nodes`는 **문서 전체 BodyText 구역**이 공유합니다. document/validation이 구역 인덱스 정렬 순서로 남은 예산을 전달하고 성공한 구역 보고서의 실제 소비량을 차감합니다. 다음 구역에서 예산을 다시 초기화하지 않습니다. max_depth는 각 속성 set의 내부 깊이이며 합산하지 않습니다.

각 구역은 전달받은 남은 예산을 이미 검사한 뒤 소비량을 반환하므로 차감이 언더플로하지 않습니다. 입력 Options는 값 복사하여 사용하며 호출자 옵션을 변경하지 않습니다. 전체 decoded 바이트/레코드 제한도 별도로 계속 적용합니다. 미선택은 양식 예산을 소비하지 않으며 0개 한도도 선택된 양식이 없으면 허용됩니다.

이 예산은 ViewText에 자동 적용되지 않습니다. ViewText는 기존 별도 framing/decoded 예산과 미해석 진단 경로를 유지하며 양식 의미 검사를 수행하지 않습니다. 양식 속성 예산만으로 전체 메모리를 제한하는 것은 아니며 본문 Tree와 전체 Link 등 기존 메타데이터 제한도 필요합니다.

## 실파일·적대적 검증

테스트 mode 109(문서)와 110(CFB)은 선택 u8·양식/속성 바이트/노드/깊이 한도 u32 네 값 뒤에 기존 입력을 받습니다. 공통 `form-selection.zig`가 선택 접두부를 읽습니다. 전체 문서 보고서는 각 구역 끝에 forms의 14개 수치를 추가합니다. 테스트 측 stride/필드 위치 기준은 기존 `document-report-wire.mjs` 한곳입니다. 구역별 위치를 별도 구현에 하드코딩하지 않으며, report-wire 계약 테스트는 독립 고정값으로 744바이트 구역 크기와 새 필드 시작/끝·범위를 검사합니다.

기본 문서 대조도 독립 원시 레코드 개수로 unselected 진단을 확인하도록 갱신했습니다. 선택 결과는 기존 독립 JS 속성/스키마 증거에서 계산해 보고서 전체 바이트와 대조합니다. 변경하지 않은 다른 모듈 보고서와 CFB 부가 스트림 진단도 함께 비교합니다.

실파일 `form-01.hwp`·`form-02.hwp`는 각각 양식 5개, 속성 노드 118개, 저장 글자 모양 참조 valid 5개입니다. 속성 바이트는 각각 4,306/4,298입니다. 두 파일 모두 decoded 문서와 원본 CFB에서 선택/미선택 및 정확한 예산을 확인합니다.

코드 불일치·태그 91의 잘못된 부모·중복·스키마 자료형 불일치·저장 ID 오버플로를 메모리에서 변조하고 문서/CFB 두 경로에서 거부를 확인합니다. 미선택에서는 그 양식 내용을 해석하지 않는 기존 동작과 비교합니다. CFB는 메모리의 독립 모델에서 BodyText/Section0만 압축·재작성하며 디스크 표본이나 다른 Section0 스트림은 변경하지 않습니다.

다중 구역 검사는 입력 순서를 1→0으로 제공하고 구역 1에 범위 밖 ID 하나와 미지 양식 타입 하나를 넣습니다. 반환 구역 0은 valid 5개, 구역 1은 valid 3·invalid 1·deferred 1개로 구분됩니다. 합계 양식 10개·속성 8,604바이트·236노드의 정확한 예산이 통과하고 각각 한 단위 부족하면 다음 구역에서 실패합니다. 입력 순서를 바꿔도 같은 전체 보고서가 나옵니다. 통합 검사에서 거부 32건과 오류 후 정상 재실행을 확인합니다.

네이티브 검사는 12개 구역에서 정상 경로와 마지막 구역의 속성 노드 예산 부족 경로에 모든 할당 실패를 주입합니다. 이전 구역의 임시 결과, 문서 보고서 배열, 메모/범위 수집 상태의 정리와 원본 바이트 불변성을 확인합니다. 양식 수 0 제한과 미선택 진단의 차이도 검사합니다.

## 실행 결과와 적대적 재검토

2026-09-07 최종 테스트 구성으로 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 세 모드 모두 16/16 단계, 네이티브 290/290개, Node 47/47개와 조사 도구 22/22개가 통과했습니다. HWP5 probe 호출 계수는 각각 1,404,691이며 고유 기능 수나 전체 지원률이 아닙니다. 최종 로그는 `/tmp/hwpjs-form-document-debug-final.log`, `/tmp/hwpjs-form-document-safe.log`, `/tmp/hwpjs-form-document-fast.log`입니다.

초기 회귀는 보고서 wire 계약 테스트가 이전 구역 크기 688바이트를 기대하여 실패했습니다(`/tmp/hwpjs-form-document-debug.log`). forms 14개 수치 추가에 따른 744바이트 크기와 두 번째 구역의 기존 필드 위치를 갱신하고, forms 시작/끝 위치·범위 밖 접근 검사를 추가했습니다. 이 실패 로그를 성공 기록에 포함하지 않았습니다. 소유 관계·토큰 코드·중복의 통합 변조 검사도 최종 전체 실행 전에 보강했습니다.

최종 세 WASM 산출물에서 문서 통합 검사(거부 32건), 기존 토큰 연결 검사(합성 정상 28·거부 22건, 실파일 변조 파일당 15건), wire 계약을 다시 실행해 결과 일치를 확인했습니다. 캐시 ID는 Debug `473b51736d4765dd7a4c3086cdc90b24`, ReleaseSafe `12fb9ff7208bebbfa0efafcfec0ad655`, ReleaseFast `f3efe3046f475df5289e266c96ad8740`입니다. 캐시/임시 로그 보관에 의존하지 않으며 재빌드한 audit에 해당 검사가 포함됩니다.

재검토는 기존 Tree/Links의 재사용과 소유권, 구역 간 예산·오류 후 정리, 선택/미선택의 검사 경계, 순서가 다른 구역의 진단과 wire 위치, SSOT·문서상 남은 범위로 나누어 수행했습니다. 최종 계약 아래 새 결함은 발견하지 못했으며 포맷·변경 JS 문법·문서 링크·diff 검사도 통과했습니다.

## 남은 범위

양식 전체의 값 범위·기본값·활성 참조·리스트/이벤트 의미, 다른 버전/비 BMP 원본 프로그램의 길이 규칙, ViewText 양식 의미 검사, 렌더링·편집·저장은 남아 있습니다. 이번 통합은 기존 문서 검증 경로에서 관측 양식 검사를 선택하고 누락·오류·미해석 진단을 받는 단계입니다.
