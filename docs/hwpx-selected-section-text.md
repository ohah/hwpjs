# HWPX 선택 분기 텍스트 이벤트

`Document.inspectSelectedSectionText(allocator, options, supported_namespaces, visitor)`는 기존 [section 텍스트 이벤트](hwpx-section-text.md) 스캐너에 호출자가 선언한 capability 집합을 적용합니다. `hp:run` 또는 활성 분기의 직접 자식 `hp:switch`에서 첫 일치 `case` 또는 첫 `default`만 이벤트·보고서에 포함합니다. 선택 정책의 유일한 구현은 [조건부 참조 선택](hwpx-switch-selection.md)의 `compatibility_selection.zig`입니다. 독립적인 namespace 판정이나 버전 추측을 추가하지 않습니다.

기본 `inspectSectionText`와 `inspectKnown.section_text`는 기존대로 양쪽 분기를 순회하는 **원문 관측** 결과입니다. 새 API에서 문단·run·`hp:t` 순번과 텍스트/인라인 개수·한도는 활성 분기만 대상으로 다시 계산합니다. `required-namespace` 속성값은 기본 4096바이트 한도를 적용합니다. section 수·직접 문단 수와 읽은 XML 바이트 수는 같은 원문 section에 대한 값입니다. 방문자는 선택된 분기의 시작·끝·내용 이벤트만 받습니다. 한편 비활성 분기도 XML 문법·namespace·XML 이벤트/깊이·입력 바이트 한도 검사를 거치며, 이 API는 오류 전 이미 전달한 이벤트를 되돌리지 않습니다.

지원하는 것은 기존 스캐너가 정의한 section 텍스트 경로와 그 안의 직접 `switch/case/default`에 한정됩니다. 표·도형 텍스트의 가시적 순서, 차트/OLE의 대체 표현 의미, 변경 추적 적용, header/masterpage의 조건부 내용, 전체 문서 모델·렌더링·편집·저장은 이 단계의 결과가 아닙니다. 호출자 capability가 없으면 기본 분기가 선택되며, 없거나 일치하지 않는 `case`를 텍스트로 만들어내지 않습니다.

검증은 원문 양쪽 분기 보존, 빈·한 개·중첩 capability 선택, 선택된 텍스트·인라인 이벤트와 개수, 비활성 분기의 텍스트 한도 제외, 잘못된 capability 거부, 비활성 분기의 잘못된 XML 문자 참조 거부, 모든 할당 실패를 포함합니다. 첫 실파일 대조에서 원문 텍스트 보고서 전체가 선택 결과와 같아야 한다는 가정이 깨졌습니다. `issue2006/1790387_prep_final_report.hwpx`의 두 `switch`에서 차트·OLE **각 분기 안에 캡션 문단**이 있으므로 양쪽 원문을 센 보고서와 한쪽만 선택한 보고서는 달라야 합니다. 이 반례를 무시하지 않고 독립 ZIP/ElementTree oracle(`tools/hwpx-section-text-oracle.py`)에 분기별 문단·run·`hp:t`·UTF-8 바이트·인라인 개수의 제거량을 추가했습니다.

현재 corpus 476개에서 독립 oracle이 계산한 제거량은 **각 분기별** 문단 2개·run 2개·`hp:t` 2개·UTF-8 173바이트·인라인 0개이고, 모두 shard 3의 위 파일에 있습니다. 양쪽 캡션의 글자가 같다는 관측은 두 개체가 시각적으로 동치라는 증명이 아닙니다. Zig 선택 보고서는 원문과의 차이를 동일한 5개 필드로 계산해 shard별 독립 기대값과 대조했습니다. 이어서 oracle이 유일한 해당 파일 경로를 출력하도록 하고 Zig 조사에도 그 파일은 위 제거량, 다른 파일은 0인지를 확인하는 검사를 추가했습니다. 강화한 선택 실파일 8개 shard가 모두 통과했습니다. 합성 선택 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 5/5(루트 테스트 포함) 통과했고, 기존 원문 section 텍스트 테스트 11/11도 통과했습니다. 전체 Debug `zig build test --summary all`은 2,271/2,271, ReleaseSafe 제품 빌드는 5/5 단계, 전체 `zig build audit -Doptimize=ReleaseSafe --summary all`도 통과했습니다. `zig build compare -Doptimize=ReleaseSafe --summary all`은 47/47 JS 비교 테스트를 통과했습니다.
