# HWPX 선택 분기 마스터페이지 서식 참조

`Document.inspectSelectedMasterPageStyleReferences(allocator, options, supported_namespaces)`는 정규 masterpage 파트의 루트 직접 `hp:subList` 아래에서 조건부 분기의 활성 문단·run만 선택하고, 기존 header의 명시적 서식 ID에 연결합니다. 원문 양쪽 분기를 검사하는 `inspectMasterPageStyleReferences`와 `inspectKnown.master_page_style_references`는 바꾸지 않습니다. Zig 코어 API이며 제품 JS/WASM 공개 API, 실제 스타일 적용·조판·편집·저장은 아닙니다.

분기 정책과 첫 일치 `case`/`default` 판정은 [공통 정책](hwpx-switch-selection.md)의 `compatibility_selection.zig`를 사용합니다. 스트리밍 깊이별 활성 상태는 `compatibility_frames.zig`가 section·마스터페이지 서식 검사에 공유하고, 마스터페이지 모듈은 직접 `subList` 범위와 파트 예산만 소유합니다. `paraPrIDRef`·`styleIDRef`·`charPrIDRef`의 숫자·대상 판정은 기존 [마스터페이지 서식 참조](hwpx-master-style-references.md)의 `paragraph_style_links.zig`·`id_references.zig`를 그대로 사용합니다.

비활성 분기의 서식 ID 오류와 문단·run 한도는 선택 보고서에서 제외하지만, 원본 ZIP/XML 문법·namespace·XML 바이트 한도는 그대로 적용합니다. 파트와 직접 `subList` 개수, 해제 XML 바이트는 선택 전 원문 기준입니다. 호출자가 지원 namespace를 명시하며 빈 집합이면 일치 `case`가 없을 때 첫 `default`를 사용합니다. 잘못된 지원 URI는 파트를 읽기 전에 거부합니다. 선택 결과와 [마스터페이지 텍스트 이벤트](hwpx-master-text.md)는 같은 분기 정책을 쓰지만 각각 별도 보고서와 별도 예산입니다.

## 검증과 한계

합성 ZIP은 원문/선택 분리, 선택 텍스트와 문단·run 수 대조, 비활성 잘못된 ID 및 예산 격리, 중첩 switch와 앞선 default, 외국 namespace의 동명 switch·subList 경계, 잘못된 capability, 모든 할당 실패를 검사합니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 둡니다. 실파일 조사는 `hwpx_known_survey.zig`의 8개 shard에서 선택 텍스트와 서식 참조 수를 대조하고, switch가 없는 파트는 원문 보고서와 전체 값이 같은지 검사합니다. 독립 `tools/hwpx-manifest-xml-oracle.py`의 로컬 corpus 조사 결과 마스터페이지 switch는 **0개**였습니다. 따라서 분기별 마스터페이지 서식 선택의 양성 검증은 합성 ZIP 반례에 한정되며 실파일 대조를 그 증거로 사용하지 않습니다.

이 단계는 서식 **참조 ID** 연결이지 화면 표시·상속된 스타일 값·마스터페이지 적용 결과를 계산하지 않습니다. 원문 양쪽 분기 보고서의 진단을 선택된 문서의 적합성 진단으로 대체하지 않으며, 문서 모델·저장/편집은 아직 후속 범위입니다.

2026-09-25 로컬 검증에서 합성 선택 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 6/6(루트 테스트 포함), 기존 원문 마스터페이지 서식 테스트는 각각 6/6 통과했습니다. 선택 실파일 known survey 8개 shard도 전부 통과했고, 선택 텍스트와 서식 문단·run 수 및 각 참조의 존재/부재 합계를 대조했습니다. corpus에는 마스터페이지 switch가 0개이므로 이 성공을 실파일의 분기별 선택 지원으로 확대하지 않습니다. ReleaseSafe 전체 audit·제품 빌드·JS 비교, Zig 포맷·diff 검사와 독립 Python oracle 자체 테스트도 통과했습니다. JS 비교는 CFB 제품 API 회귀이며 새 Zig 코어 API의 공개 WASM 검증이 아닙니다.

마지막 외국 namespace 경계 반례까지 포함한 최종 소스의 전체 Debug `zig build test --summary all`은 **2367/2367** 통과했습니다. 이전 2366개 결과는 그 반례 추가 전 실행이므로 최종 결과로 사용하지 않습니다.
