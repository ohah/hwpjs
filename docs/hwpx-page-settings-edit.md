# HWPX 편집 용지 쓰기

기존 [쪽 설정 원값 조회](hwpx-page-geometry.md)를 사용하되 조회 성공 자체를 쓰기 권한으로 취급하지 않습니다. HWPX의 기존 구역에 용지 크기·방향·여백 일곱 필드·제본을 함께 적용하고 기존 Native history protocol 2에 한 항목으로 기록합니다. public WASM ABI는 6이며 optional export 두 개가 추가됩니다. 구역 신설은 후속 범위입니다. HWP5의 별도 지원은 [HWP5 쓰기 계약](hwp5-page-settings-edit.md)을 따릅니다.

## 소유권과 효력 범위

`page_settings_edit_owners.zig`가 구역별 단일 소유권을 관측합니다. 지원하는 위치는 section의 직접 p → run → secPr → 직접 pagePr입니다. pagePr 자체가 없거나 여러 개, secPr가 여러 개, 조건부·중첩 소유권, 직접 margin 중복이면 쓰기를 거부합니다. 원값의 빠진 속성과 빠진 margin은 null로 유지하며 UI에서 모든 값을 명시한 뒤에만 삽입합니다. 생성자 기본값이나 마지막으로 관측한 설정을 효력 값으로 추정하지 않습니다. UTF-8 section XML과 기존 2011 namespace 정책을 따릅니다. 구역 상한은 512입니다.

Native capabilities는 session lifetime·history revision·단조 변경 serial, 구역과 owner/page/margin node 식별자 및 전체 expected snapshot을 묶습니다. section scope는 정확히 한 대상, document scope는 모든 구역을 중복 없이 포함해야 합니다. revision이 undo로 돌아와도 serial로 이전 티켓을 거부합니다. prepare 직전 다시 검증하고, pending 변경을 저장한 뒤 재열면서 node index가 달라지면 동일 구역의 유일한 소유자와 전체 기하를 다시 대조합니다. 모든 변경을 준비한 뒤 기존 commit 경로로 한 번만 교체합니다.

SDK는 인스턴스별 scope를 추가하며 completion 0/1/2/3과 output 소유권을 기존 공통 Native edit 경로로 처리합니다. 완료 상태가 불확실할 때 재시도하지 않습니다. Core `getPageSettings()`는 원값·미지원 사유와 opaque target만 제공합니다. WeakMap에 발급 당시 editor state와 Native capability를 보관하므로 복사·위조·다른 editor·이전 상태의 target은 거부됩니다. `EDIT_PAGE_SETTINGS_COMMAND`가 typed 쓰기 진입점이며 셀 편집 lease나 experimental operation으로 우회하지 않습니다. composition을 처리한 뒤 큐에서 실행할 때도 다시 확인합니다.

범위는 현재 선택이 가리키는 구역 또는 문서 전체입니다. 선택이 없으면 section 0을 대신 쓰지 않으며 사용자가 전체를 고르거나 실제 구역 선택을 만들어야 합니다. 기존 여러 구역에 같은 값을 적용할 때 어느 구역의 원값으로 초기화했는지와 적용 범위를 구분합니다. 모든 구역을 선택해도 지원하지 않는 소유자가 하나라도 있으면 원자적으로 거부합니다.

## 방향과 제본

`width`/`height`는 저장된 축을 그대로 쓰고 방향 변경 때문에 전치하지 않습니다. [한컴 개발자 답변](https://forum.developer.hancom.com/t/pagepr-width-height/1693)은 방향과 무관하게 치수 값이 유지되고 landscape가 회전을 나타낸다고 설명합니다. 기존 query/layout의 대응을 유지하여 WIDELY는 세로, NARROWLY는 가로로 표시하며 Canvas에서만 물리 폭·높이를 바꿉니다. 원본이 부재이면 어느 방향도 추정하지 않습니다.

LEFT_ONLY는 왼쪽 제본, LEFT_RIGHT는 맞쪽의 안쪽 제본, TOP_BOTTOM은 위쪽 제본입니다. 맞쪽은 기존 물리 페이지 순서에 따라 홀수 왼쪽·짝수 오른쪽에 제본 여백을 더합니다. 구역의 표시 쪽번호 재시작과 물리 순서를 혼동하지 않습니다. `page-section-layout`가 기존 물리 쪽 개수에서 offset을 파생하고 `page-reference-boxes`가 실제 본문 원점을 정합니다. 위쪽 제본은 위 여백에 더합니다. header/footer 값도 모두 명시하고 유효 본문 영역이 양수인지 검사합니다.

공식 형식 근거는 고정 리비전 [pagePr 필드](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pagePr.h), [pmargin 필드](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pmargin.h), [enum 선언](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)입니다. 동작 확인은 [편집 용지 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/setting_paper/setting_paper.htm)과 [제본 도움말](https://help.hancom.com/docs/ko-KR/mergedProjects/hoffice_hwp/topics/hancomoffice/hwp/format/setting_paper/setting_paper%28books%29.htm), 기존 제품 layout 및 자체 합성 기대값을 사용했습니다. 생성자 기본값은 부재 속성의 의미로 채택하지 않았습니다. 외부 구현 알고리즘을 근거로 채택하지 않았으며 별도의 엄격한 클린룸 인증을 주장하지 않습니다.

## 저장과 배치

`xml_scalar_attributes_upsert.zig`는 필요한 scalar 속성만 삽입·교체합니다. 의미가 같은 숫자의 기존 어휘·따옴표·unknown 속성과 자식 XML을 보존합니다. 비대상 ZIP part의 바이트·메타데이터·순서도 보존합니다. 빠진 margin은 대상 pagePr에만 namespace를 명시해서 만듭니다.

기하 변경 뒤 기존 hp:linesegarray를 그대로 재사용하면 Canvas가 과거 줄 배치를 유지합니다. `page_settings_layout_cache.zig`는 대상 구역에서 p의 직접 자식이고 알려진 lineseg 필드만 있는 파생 캐시를 제거합니다. 낯선 속성·자식·내용이 있으면 Unknown XML을 버리지 않고 `UnsupportedPageLayoutCache`로 전체 쓰기를 거부합니다. 편집하지 않은 구역 캐시는 그대로 둡니다. 이후 기존 display resource invalidate 및 측정 layout 경로가 줄을 다시 배치합니다. 새 진단 옵션이나 대체 배치 SSOT는 추가하지 않습니다.

한국어 모달은 공유 demo controller에서 세 framework가 함께 사용합니다. mm 입력은 HWPUNIT으로 반올림하며 저장된 축을 유지합니다. 원값은 소수점 네 자리로 표시해 정수 HWPUNIT 왕복을 보존합니다. 원값이 빠졌으면 빈 칸으로 보이고 필수 입력을 요구합니다. 취소·오류·stale target은 쓰기나 추가 history를 만들지 않습니다. 새 구역부터 적용하는 공식 UI의 별도 동작은 제공하지 않습니다.

## 집중 검증

Native 전용 진입점은 `src/hwpx_page_settings_edit_probe.zig`이며 `--test-filter 'page settings'`로 합성 입력만 검사합니다. source 테스트는 `tools/tests/page-settings-values.test.mjs` 및 `tools/tests/hwpx-page-settings-native.test.mjs`입니다. 후자는 정확한 WASM SHA와 새 절대 evidence 디렉터리를 요구합니다. `tests/helpers/page-settings-edit-fixture.py`는 Native가 생성한 blank에서 다중 구역·부재·중복·조건부·알려진/낯선 줄 캐시를 합성합니다.

`tools/hwpx-page-settings-edit-oracle.py`는 제품 import 없이 ZIP/XML 원값, 비대상 바이트와 어휘 보존을 검사합니다. normal/-O 양쪽에서 양성 및 잘못된 기대값 반례를 실행합니다. Native prepare/commit/undo/redo·재열기·할당 실패, SDK stale/foreign/불확실 완료, typed Core 큐의 실제 input lease, 세 framework의 메뉴·실제 Canvas 픽셀·배치·저장 재열기를 각각 구분하여 기록합니다. OS IME와 모든 실제 문서의 편집 적합성은 이 증거만으로 주장하지 않습니다.

공개 DTO SSOT는 `packages/core/src/commands/page-settings-dto.ts`이며 SDK 선언이 이를 참조합니다. format별 capability와 완료 상태별 outcome union을 사용하고 기존 HWPX DTO 필드와 runtime 동작은 유지합니다.

현재 Main 결합의 산출물·분모·지원 경계는 [편집 용지 통합 기록](page-settings-delivery.md)을 따릅니다.
