# HWP5 편집 용지 쓰기

기존 PAGE_DEF 원값 관측과 별도로 Native Session/history/CFB 저장을 연결합니다.
[HWPX 쓰기 계약](hwpx-page-settings-edit.md)의 공용 값 DTO·typed Core 명령·한국어 모달을 사용하되 원본 소유권과 방향 enum은 형식별로 검증합니다.
구역 신설이나 전체 포맷의 Native source completion은 이 기능의 완료 범위가 아닙니다.

## 형식 근거와 방향

공식 HWP5 개정1.3 표131은 width/height·여백7개·flags의 40바이트 PAGE_DEF를 정의합니다.
표132는 bit0 좁게/넓게, bit1..2 한쪽/맞쪽/위쪽 제본을 정의합니다. 저장 축은 전치하지 않습니다.
기존 body/page_def.zig와 web/preview/hwp5-page-geometry.mjs의 대응에 따라 공용 widely(세로)는 HWP5 narrowly(bit0=0), 공용 narrowly(가로)는 HWP5 widely(bit0=1)로 변환합니다.
XML enum을 raw HWP5 enum으로 cast하지 않습니다. 공식 줄 세그먼트 tag bits 0,1,16..21,31만 알려진 캐시로 취급합니다.
공식 명세 정리본의 해당 표와 기존 query/layout을 사용했으며 rhwp 등의 코드·알고리즘을 참조하지 않았습니다. 엄격한 독립 클린룸 인증은 주장하지 않습니다.

## 모듈과 권한

page_settings_payload.zig는 9개 정수와 flags 하위3bit만 새 payload에 씁니다.
상위 flags·trailing bytes를 보존하며 예약 binding=3, 잘린 payload, 기대 payload 불일치와 0치수를 거부합니다. 이 primitive 자체는 owner/history 권한이 아닙니다.

page_settings_types.zig는 공용 기하·scope·expected 원값을 검증합니다. section scope는 정확히 한 구역, document scope는 모든 구역을 한 번씩 포함합니다.
bool 배열로 중복을 검사하며 구역 상한은512입니다. 기존 page_settings_snapshot.zig가 최초 top-level 문단의 유일한 secd와 그 직접 PAGE_DEF를 확인합니다.
부재·중복·잘못된 parent는 쓰기 불가입니다.

page_settings_section.zig는 선택 구역의 scalar와 알려진 파생 줄 캐시만 바꿉니다.
LINE_SEG(tag69)는 문단(tag66)의 직접 자식이며 자식 레코드·낯선 flag bit가 없을 때만 지웁니다. 문단 header의 line count는0으로 맞춥니다.
unknown owner·flags·자식은 UnsupportedPageLayoutCache로 거부합니다. 그 외 바이너리는 보존합니다.
page_settings_rebase.zig는 현재 구역 모델과 style offset을 소유하고 rebased_source의 original record count 계약을 유지합니다.

Session은 원값 snapshot 검증 후 pending text/DocInfo resource를 포함해 현재 상태를 저장합니다.
임시 CFB를 한 번 열고 대상마다 raw/model draft를 준비합니다. 저장으로 source node가 바뀌면 동일 구역의 유일한 PAGE_DEF와 전체 원값을 다시 대조합니다.
모든 준비가 성공한 뒤에만 section을 no-fail swap합니다. 값이 같은 구역은 기존 바이트와 캐시를 유지합니다.
기존 protocol2 bridge/checkpoint를 사용하며 새 history 스택을 만들지 않습니다. 오류/OOM이면 원본·revision·redo를 보존합니다.

배포·전자서명·history 등 제한 save feature, 대상 구역의 pending created-table/cell-style는 거부합니다.
비대상 구역·DocInfo·unknown stream·CFB metadata는 저장 경로가 보존합니다.
known 캐시 제거는 현재 Canvas 측정 배치를 갱신하기 위한 것이며 한컴 전체 조판 동치를 뜻하지 않습니다.

## SDK·Core와 공개 타입

SDK 메서드는 supportsPageSettingsWrite/pageSettingsCapabilities/writePageSettings입니다.
HWP5 capability는 format=hwp5이며 target은 section과 raw expected Setting(source_node, 9치수, flags, orientation, binding, extra_bytes)입니다.
HWPX target과 혼합하지 않습니다. source 원값만으로 쓰기 권한을 재생성하지 않습니다.

SDK별 scope가 붙은 수명 token과 Native formatting lifetime·history revision·view epoch(serial decimal string)를 대조합니다.
open/close·변경·undo/redo 뒤 이전 target을 재사용하지 않습니다. Native output은 borrowed이며 SDK가 복사 후 finally free합니다.
completion0/1/2/3과 unknown/cleanup 실패를 공통 outcome에 보존하며 불확실 완료를 자동 재시도하지 않습니다. public ABI6과 history protocol2를 구분합니다.

공개 DTO SSOT는 commands/page-settings-dto.ts이며 SDK .d.mts도 이를 참조합니다.
Core는 내부 경로로 선언을 내보내 설치 패키지가 source 밖의 js 선언을 추적하지 않게 합니다.
capability는 format, row는 target/reason, outcome은 nativeCode/application/changed의 union입니다.
public capability/outcome any를 제거했으며 정수 범위·중복·기하는 runtime에서도 검사합니다.

Core getPageSettings는 HWP5 원값을 공용 표시 DTO로 변환하고 opaque target을 private WeakMap에서 발급합니다.
다른 editor·복사·stale state·입력 큐 settlement는 거부하며 selection.section이 없으면0을 추정하지 않습니다.
Native binding/Core target을 다른 프로세스의 지속 ticket으로 전달하지 않습니다. CLI/MCP는 같은 살아 있는 인스턴스의 조회→쓰기 순서를 사용해야 합니다.

## 검증과 남은 범위

Native 명시 probe는 h5_page_settings_write_probe.zig입니다.
단일 history·no-op·undo/redo·재열기, 위조 snapshot, 두 구역/비대상 raw 보존, apply OOM과 redo, unknown cache 거부를 검사합니다.
payload의 방향2×제본3조합과 unknown flags/tail은 별도 scalar unit에서 확인합니다.

SDK/Core 시험 tools/tests/hwp5-page-settings-native.test.mjs는 정확 SHA WASM·새 절대 evidence 디렉터리·해시를 고정한 두 구역 입력을 요구합니다.
오래된/외부/복사 target, 단일/전체 구역, H5 bullet 및 표 split의 교차 이력, no-op redo를 검사합니다.
독립 tools/hwp5-page-settings-edit-oracle.py는 기존 stdlib CFB framing 검사기를 사용하며 제품 reader/writer를 import하지 않습니다.
normal/-O로 metadata·비대상 stream·PAGE_DEF 원값·상위 flags/tail·그 외 record를 대조하고 잘못된 치수와 root CLSID를 거부합니다.

실제 세 framework Worker·모달·Canvas 폭/행수·저장·undo/redo·재열기는 별도 GUI cohort입니다.
OS IME, PAGE_DEF 부재 생성, 새 구역, unknown cache 확대, pending generated-object/cell-style 쓰기, 모든 실제 문서·전체 조판 동치는 후속 범위입니다.
tooltip/metric guide 완료와 Native 전체 source completion을 구분합니다.

다중 구역의 pending cell-style 검사는 구역별 고정 bool 인덱스를 먼저 만들고 각 target을 한 번 확인합니다. 별도 진단 옵션 없이 해당 검사 비용을 O(entries + targets)로 유지합니다.

현재 Main 결합의 산출물·분모·지원 경계는 [편집 용지 통합 기록](page-settings-delivery.md)을 따릅니다.
