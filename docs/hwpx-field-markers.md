# HWPX 필드 시작·끝 마커

## 범위와 근거

[한컴 공개 fieldBegin 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldBegin.cpp)은 `id`·`type`·`name`·`editable`·`dirty`·`zorder`·`fieldid` 속성과 직접 자식 `parameters`·`subList`·`metaTag`를 정의합니다. [fieldEnd 모델](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/fieldEnd.cpp)은 `beginIDRef`·`fieldid` 속성을 정의합니다. `type`의 알려진 어휘는 [공개 `g_FieldList`](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)를 따릅니다. 공개 코드를 이식하지 않았습니다.

`Document.inspectFieldMarkers()`는 구조가 선택한 2011 section의 정확한 `hp:fieldBegin`·`hp:fieldEnd`를 원문 XML 및 부모 위치와 함께 소유 결과로 반환합니다. `XmlTrees.inspectFieldMarkers()`와 `Document.inspectKnown().field_markers`는 같은 검사기를 재사용합니다. 부모가 `hp:ctrl`인지 임의로 가정하거나 다른 namespace를 같은 종류로 승격하지 않습니다. header·master-page·비활성 분기의 의미 선택은 이 보고서의 범위가 아닙니다.

## 책임·연결 계약

`field_marker_fields.zig`는 속성 원값과 숫자·불리언 어휘 및 알려진 필드 종류만 판독하고, `field_marker_links.zig`는 section 내부의 명시적 `beginIDRef` 연결만 담당합니다. `field_markers.zig`는 XML 트리 순회, 직접 자식 수, 원문·부모 이름 소유권과 보고서를 담당합니다. `parameters`의 재귀 값과 `metaTag` 직접 텍스트는 기존 [파라미터 목록](hwpx-parameter-lists.md)과 [metaTag](hwpx-meta-tags.md) 검사기의 단일 책임입니다. 여기서는 중복 해석하지 않습니다.

속성은 부재·빈 값·정규화된 원값을 구별합니다. `id`와 `beginIDRef`는 UINT 범위, `fieldid`는 UINT32, `zorder`는 INT32, `editable`·`dirty`는 XML 불리언 어휘를 확인합니다. 모르는 `type`은 실패시키지 않고 `type_known=false`로, 모델 밖 속성·직접 자식은 원문 및 개수로 남깁니다. 필드 ID는 숫자값으로 비교하므로 `0001`과 `1`은 연결되지만, 각 원문 표기는 그대로 보존됩니다. 중복 시작 ID·없는/앞선 참조·중복 종료·교차 종료·두 쪽에 모두 존재하는 `fieldid` 불일치는 별도 진단입니다. `fieldid`만으로 연결을 추측하거나 누락된 종료를 자동 생성하지 않습니다.

기본 한도는 마커 200,000개, 부모 이름과 개별 선택 속성 각각 4 KiB, 복제 원문·부모 이름·속성 합계 128 MiB입니다. 미등록 속성의 개별 값은 선택 속성 한도 대신 상위 XML 원문 및 총 복제 바이트 한도를 받습니다. 결과는 ZIP/트리 수명과 독립적이고 `Report.deinit()`으로 해제합니다. 이 한도는 임시 트리·인덱스 해시맵을 포함한 전체 RSS 한도가 아닙니다.

## 실파일·적대적 검증

로컬 두 corpus의 HWPX 후보 484개 중 ZIP 종료 레코드가 없는 6개와 암호화된 2개를 제외한 476개를 독립 Python ZIP/ElementTree 오라클과 파일별 해시로 대조합니다. 조사 대상에는 시작 마커 874개·끝 마커 868개가 있고, 같은 section의 명시적 ID로 연결되지 않은 시작 6개를 관찰했습니다. 이 6개를 무조건 파일 오류나 정상 상태로 단정하지 않고, 각각 `unmatched_begins` 진단으로 보존합니다. 모델 밖 `fieldBegin/@metaTag` 11개도 원문 속성으로 남깁니다. 실파일에서 `parameters` 내부와 `metaTag` 텍스트 해석은 각 기존 검사기의 증거를 따릅니다.

적대적 검증은 (1) 공개 모델과 알려진 enum 어휘, (2) namespace·직접 자식/부모·속성 부재/빈 값·문자 참조·UTF-16, (3) ID 선행·중복·교차·section 분리와 `fieldid` 불일치, (4) 바이트/개수 한도·할당 실패·입력 해제 후 보고서 수명, (5) 독립 오라클의 값·참조·자식·namespace 변이와 전체 파일별 해시를 각각 확인했습니다. 끝이 없는 시작이 있는 실제 3개 문서의 단독/known 보고서가 일치하고, 미연결 시작 1·4·1건과 미해결 끝 0건도 확인했습니다. 이 조사는 필드 평가·하이퍼링크 동작·책갈피 렌더링·편집/저장 왕복 또는 모든 OWPML 버전의 스키마 적합성 증명이 아닙니다. 재현 명령은 [개발·검증 명령](development-commands.md)에 있습니다.

2026-09-26 기준 Debug 전체 `zig build test --summary all`은 최종 코드 상태에서 종료 코드 0, 2,609/2,609 테스트 및 5/5 빌드 단계를 통과했습니다. 집중 테스트는 Debug·ReleaseSafe·ReleaseFast 각각 9/9, ReleaseSafe 제품 빌드와 `zig fmt --check build.zig src`, 독립 Python oracle의 일반/`-O` 변이 self-test, 전체 476개 허용 파일별 해시 대조, 기존 known 문서 샤드 0~7도 통과했습니다. 전체 테스트 출력의 `failed command:` 문자열은 후속 [Zig stderr 독립 재현](zig-test-stderr.md)에서 성공한 테스트의 진단 출력으로 설명됐습니다. 이 문구만으로 실패를 판정하지 않으며 종료 코드와 최종 테스트 상태를 함께 확인합니다. 실파일 corpus와 known 연결은 기본 전체 테스트 밖의 선택 검사입니다.
