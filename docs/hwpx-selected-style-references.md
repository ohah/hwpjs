# HWPX 선택 분기 문단·run 서식 참조

이 API는 section에 한정됩니다. 마스터페이지의 대응 API와 별도 파트 선택·예산은 [선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)가 소유합니다.

`Document.inspectSelectedStyleReferences(allocator, options, supported_namespaces)`는 기존 [section 서식 참조](hwpx-section-references.md)의 같은 header ID 색인과 속성→리소스 테이블 규칙을 사용하되, `hp:run` 및 활성 분기의 직접 `hp:switch/case|default` 중 선택된 쪽의 문단·run만 집계·해결합니다. 분기 판정은 [공통 조건부 정책](hwpx-switch-selection.md)의 `compatibility_selection.zig`를 재사용합니다. `inspectReferences`와 `inspectKnown.section_references`는 기존대로 두 분기를 모두 관측하는 원문 보고서입니다.

호출자가 지원 namespace를 명시하며 기본 빈 집합은 `default`를 선택합니다. 선택된 분기의 `paraPrIDRef`·`styleIDRef`·`charPrIDRef`만 기존 header 리소스 ID와 정확히 대조합니다. 비활성 분기의 숫자 손상·미해결 ID와 문단·run 개수는 선택 보고서의 진단·요소 예산에 포함하지 않습니다. 반면 전체 section XML은 기존 문법·namespace·원문 바이트 한도 검사를 그대로 받습니다. section 수와 해제 XML 바이트 수는 원문 기준입니다. 암호화 문서와 header/section 구조 오류는 선행 검사에서 거부합니다.

이 API는 서식 참조의 **활성 분기 관측**이지 적용된 스타일 값, 차트/OLE 렌더링, header/masterpage의 조건부 요소, 페이지 레이아웃, 전체 문서 모델이나 편집·저장을 구현한 것이 아닙니다. `switch` 밖의 section 문단·run과 선택된 chart/OLE 캡션 안의 문단·run은 서식 참조 스캐너의 범위대로 검사합니다. `case/default`의 구조 이상은 별도 [switch 구조 진단](hwpx-switch-shape.md)에 남깁니다. 현재 서식 참조 스캐너는 `hp:t` 후손의 동명 `hp:run`도 run으로 셀 수 있지만 텍스트 스캐너는 이를 인라인으로 분류합니다. 따라서 실파일의 문단·run 수 일치를 임의의 중첩 XML에 대한 두 API의 동치로 일반화하지 않습니다.

합성 테스트는 raw 양쪽 캡션과 선택된 한쪽의 희소 ID 해결, 비활성 미해결 ID·숫자 오류 격리, 정확한 활성 요소 예산, 중첩 조건, default 선행, 다른 namespace의 유사 구조, 잘못된 capability, 전체 할당 실패를 다룹니다. 실파일에서는 조건부 분기가 있는 문서의 선택된 문단·run 수를 [선택 텍스트 이벤트](hwpx-selected-section-text.md)와 양쪽 capability별로 대조하고, 각 참조 종류의 존재·부재 합계가 해당 문단·run 수와 일치하는지 확인합니다.

2026-09-24 실측: 합성 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 5/5(루트 테스트 포함) 통과했습니다. 기존 원문 section 서식 참조 테스트도 별도 Debug 필터에서 통과했습니다. 선택 실파일 8개 shard의 476개 수용 문서에서 선택 텍스트·서식 참조의 문단·run 수와 참조 존재·부재 합계가 일치했습니다. 캡션이 있는 `issue2006/1790387_prep_final_report.hwpx`를 포함하며, 제거량 2문단·2run은 [독립 텍스트 oracle](hwpx-selected-section-text.md) 대조를 재사용합니다. 전체 Debug `zig build test --summary all`은 2,275/2,275, ReleaseSafe 제품 빌드는 5/5 단계, 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`과 `zig build compare -Doptimize=ReleaseSafe --summary all`도 통과했습니다. JS 비교 테스트는 47/47이었습니다. 이는 실제 표시 스타일 값의 동치 검증이 아닙니다.

2026-09-27 현재 내용 재검증: 선택 정책·section 스캐너·공유 속성→header ID 판정을 대조하고 Debug·ReleaseSafe·ReleaseFast 집중 테스트 각 5개, 원문 section 서식 참조 Debug 5개를 실행했습니다. 독립 XML 조사에서 허용 476개 파일의 선택 분기별 텍스트 제거량은 문단·run 각 2개였고 양성 파일은 하나입니다. 이전 known-inspections 8개 shard의 선택 텍스트/서식 참조 교차 대조는 제품 코드가 바뀌지 않아 재사용했으며 이 날짜에 다시 실행한 것으로 세지 않습니다. `hp:t` 안쪽 동명 `run`의 두 스캐너 범위 차이는 위 미검증 경계로 남습니다.
