# HWP5 새 차트 생성: 자원 준비 계약과 미완료 경계

기준은 scoped tree `c9619408fbc21056ebc6abfdbe6370d451753cf3`다. 이 단계는 생성의 첫 소스 후보이며 공개 createChart 활성화나 완성된 HWP 파일 생성이 아니다. 기존 차트의 값 편집·원본 자원 교체를 새 차트 생성으로 부르지 않는다. 기존 [읽기 계약](hwp5-modern-chart-readonly.md)과 HWPX 작성용 own serializer를 재사용하되 HWP5 본문·DocInfo·이력의 소유권은 HWP5에 둔다.

## 출처와 제한

[한컴 공개 HWP5 revision1.3](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)의4.2.3·표17/18과4.3.9.5/6·표117~119를 확인했다. 전자는 OLE용 STORAGE, 그림용 EMBEDDING과 항목별 압축 비트를 정의하고, 후자는 본문 OLE 및 내부 CFB의 차트 stream 구조를 설명한다. OOXML과 구버전용 Contents는 구분한다. 이 문서가 OLE presentation cache·모든 관측26바이트 꼬리·실제 앱에서의 새 파일 호환성을 자동으로 보증하지 않는다.

구현 자료는 기존 own BinData/CFB/그림 입력 검사, own chart_create_data/xml/ole와 HWP5 읽기·삽입/History 코드다. 다른 구현의 코드·알고리즘·expected JSON은 사용하지 않는다. 기존 Contents의 불투명 bytes·CLSID·presentation을 추출해 템플릿으로 복사하지 않는다. 엄격한 클린룸 절차 전체가 인증됐다고 표현하지 않는다.

승인된 own 공식 변환 입력은 전체65,536바이트/SHA256 `77c06c7027a3cb48265b81f177c9a4dc20769910404b3f6e803a727ef2071e81`이다. 기존 whole-reference approval manifest의 역할과 핀을 계승하며 이번 단계에서는 raw를 디코딩·추출하지 않았다. 이 입력은 미래 별도 source-layout 관측 및 상호운용 비교용이다. 제품 작성기의 기본 자원이나 expected JSON이 아니다.

## 구현된 소스 범위

`hwp5/chart/create_resource_ids.zig`는 전체 DocInfo BinData 항목과 /BinData의 모든 직접 자식 이름으로 다음 두 ordinal과 물리 ID를 별도로 계획한다. 링크도 ordinal 위치를 차지하지만 내부 물리 ID를 만들지 않는다. unknown 타입이나 물리0은 거부한다. 실제 CFB UTF-16/대문자 규칙으로 이름을 해석해 비ASCII case alias와 orphan/다른 확장자 점유도 예약한다. count65533은 다음65534/65535를 허용하고65534는 거부한다. 물리 ID 부족도 거부하며 부분 결과를 게시하지 않는다.

`create_docinfo.zig`는 실제 tag17 mapping과 tag18 항목 개수·레벨을 검사하고 두 항목을 추가한다. OLE는 STORAGE·명시 비압축0x22·확장자 없는 physical path, 그림은 EMBEDDING·명시 비압축0x21·png/jpg 확장자를 사용한다. 기존 항목·미지 자식·다른 자원 꼬리를 보존하고 mapping의 bin_data count만2 증가시킨다. 기존 docinfo_resource_append를 재사용한다. 파일의 기본 압축 플래그를 새 자원의 개별 압축 의미로 잘못 적용하지 않는다.

`create_resources.zig`는 own 기본2D clustered-column 데이터 검증/XML serializer와 새 CFB writer를 사용해 OOXML-only OLE를 만든다. 기존 own size-prefix envelope를 사용하며 strict reader와 H5 OOXML reader로 재검사한다. Contents/presentation이 새로 생기지 않았는지 검사한다. PNG/JPEG 입력은 기존 CRC/구조 검사를 거치고 bytes를 정확히 복사한다. DocInfo·OLE·그림·경로의 소유 메모리를 반환하며 실패 시 해제한다. 결과 payload 합계 cap은 peak heap cap이 아니다.

이 prepared bundle은 History 권한이나 검증된 삽입 target이 아니다. fallback 이미지가 차트 데이터를 시각적으로 표현한다는 증명은 아직 없다. 임의 이미지를 차트의 올바른 fallback으로 승인하지 않는다. OOXML-only 후보는 구버전 Contents와 동기화됐다는 주장이나 공식 앱 fresh-open 성공을 의미하지 않는다. 공개 ABI/SDK/버튼/Command에는 아직 연결하지 않았다.

## 다음 Session/History source contract

새 Request는 현재 HWP5 owner/binding, 실제 body anchor·UTF16 unit·expected text, 양의 i32 범위 문서 크기, authored data, 같은 데이터의 own renderer fallback을 가져야 한다. 첫 범위는 일반 본문이다. 셀·필드 내부·잠금·수식 내부·그룹·추적/배포·서명 등 입장 불명 owner는 명시 거부한다. 알려진 비대상 일치를 제외해 성공으로 꾸미지 않는다.

created_table_anchor와 created_table_host_draft.prepareObject, equation_create_session의 현재 source 정규화·물리/의미 매핑·pending table/background remap을 재사용한다. 개체 instance ID는 source_object_ids와 현재 모델/pending 표 전체의 기존 namespace에서 예약한다. BinData ordinal, physical storage ID, 개체 instance ID, OLE extent와 최종 문서 크기를 합치지 않는다. 24바이트 spec OLE와26바이트 관측 layout은 별도 프로필로 검증하기 전까지 자동 선택하지 않는다. 16비트 속성에 상위 kind 비트를 버려 쓰지 않는다.

실제 Session 게시에는 기존 HistoryV2 checkpoint가 Section·DocInfo overlay·두 BinData·그림 fallback·pending 참조를 하나의 edge로 소유해야 한다. 공개 bitmap/array를 독립 변경하거나 별도 chart undo stack을 만들지 않는다. 모든 할당·기존 보존 검증·최종 serializer 재열기는 게시 전에 끝나야 한다. 부족한 resource overlay가 현재 checkpoint에 없다면 checkpoint clone/size/rollback/restore/deinit 계약을 먼저 확장해야 한다. 이 bundle만 Session에 붙여 끝내지 않는다. 새 저장기는 기존 write-new-CFB 경로를 재사용하며 기존 객체 편집 정책을 우회하지 않는다.

## 파일 쓰기·재열기와 원자성의 필수 증명

미래 실제 실행은 승인된 별도 Native 슬롯과 새 증거 경로에서만 수행한다. 기존 후보나 Root를 파일 출력 대상으로 쓰지 않는다. 다음 각 단계가 실제 도달해야 완성된 생성으로 기록한다.

1. own 새 HWP5의 본문·pending 편집을 실제 저장하고 현재 anchor를 발급받는다. reference 원본 전체 SHA/size를 별도로 고정하며 다른 fixture를 대신 열지 않는다.
2. 신규 object/control/token·DocInfo count+2·서로 다른 두 resource ID/path를 포함하는 candidate를 기존 serializer로 작성한다. 실제 bin_data_id→DocInfo ordinal→physical path→CFB OOXML/그림의 연결을 대조한다. 숨은 orphan·비ASCII CFB alias·압축된/비압축 원본·기존 링크도 다룬다.
3. 새 파일에 실제 bytes를 쓰고 파일에서 다시 읽어 Source/Session을 fresh open한다. 빈 문서나 자원만 있는 CFB를 차트 삽입 성공으로 세지 않는다. 새 OLE의 실제 owner·개수·데이터 literal·기하·그림 fallback 연결을 독립 대조하고 비대상 record/stream 전체를 비교한다.
4. 기존 managed History에서 생성 한 번→undo→redo→fresh reopen의 전체 bytes와 revision/redo를 확인한다. ID 소진·cap exact/+1·이미지 CRC·후행 mapping 거부 및 할당 실패에도 기존 유효 redo와 전체 저장 bytes가 보존돼야 한다.
5. 공식 앱 fresh reopen·차트 선택/수정·시각 fallback을 별도로 관측한다. 자체 strict reader 통과를 외부 상호운용 증거로 대신하지 않는다. 기존4100 실패는 해소되기 전까지 열린 제한으로 남긴다.

## 안전한 시험 자료

정규 준비9개는 자체 DocInfo 레코드, 자체 값10/20/30과 독립 작성2x1 PNG로 구성한다. PNG는 형식·소유 복사용 테스트이지 차트의 시각 fallback 양성이 아니다. 별도 product core import closure에 금지 원본/외부 구현이 들어오지 않는지 확인한다. 정규 검사에 private raw가 필요하도록 묵시 등록하지 않는다.

준비한 회귀는 ordinal/physical 분리와 CFB alias/orphan, exact ordinal 한계, 링크 위치, DocInfo 미지 자식/압축 비트, count 거부 불변성, fresh OLE strict reopen/XML 일치·fallback bytes, payload cap exact/+1·빈 이미지, OOM 소유권, CRC 손상 거부다. 이9개는 현재 컴파일·실행하지 않았다. fmt·import/fixture 정적 검사는 Native 성공이 아니다. 전체 HWP 파일 쓰기/재열기·atomic History·시각 fallback·외부 상호운용은 이9개로 대체하지 않는다.

## c961 소유권 후속: 별도3선언과 gate 분리

Main의32ef4bb5 dry-run은 development-commands 한 hunk만 충돌하고 나머지9경로는 clean이었다. 이 후속의 소스 기준은 계속 c961이며 Main이 문서 hunk를 합친다. 그 충돌을 피하려고 다른 기준의 제품 파일을 가져오지 않는다. 기존3 foundation 모듈과9개 이름 선언은 그대로 보존한다.

별도 ownership probe에3개 이름을 준비한다. 첫 두 개는 각각 정상 생성/deinit 및 늦은 결과 cap 거부 경로의 allocation baseline을 실제 실행 시 측정하고 모든 fail index를 순회한다. 기존 bounded_allocation_probe의 매 호출은 fresh DebugAllocator를 만들고 total_requested_bytes0·allocated_bytes==freed_bytes·해제를 검사한다. 따라서 이3개의 의도는 per-trial 균형이다. 기존9의 sweep-final Debug.deinit을 per-trial 증거라고 다시 부르지 않는다. 각 trial 뒤 caller의 DocInfo·그림 전체 bytes도 대조한다. OOM은 LimitExceeded로 바꾸거나 삼키지 않고 harness로 전파해야 한다. 마지막 fail index를 넘으면 FailureIndexNotReached여야 한다.

세 번째는 성공 후 caller의 DocInfo·그림·계열명·범주명·숫자 버퍼를 실제 변경해 반환 DocInfo/OLE/그림·경로가 그대로인지 요구한다. OLE 안의 독립 literal도 다시 확인한다. 아직 source 준비이므로 이 조건들이 실제 통과했다고 기록하지 않는다.

분모는 foundation9와 ownership3으로 나눈다. Native compile/run은 두 그룹 모두0이고 실제 fail-index trial 수는 미측정이다. 공통 helper의 다른 이름이나 익명 import를12개에 합산하지 않는다. fmt/import·PNG 독립 점검도 Native pass가 아니다. 전체 HWP 쓰기/파일 재열기, managed History, 시각 fallback, 외부 상호운용은 계속 별도 gate이며 모두 미증명이다.

### fallback 운반 방식도 아직 미확정

현재 OLE+PNG 두 자원의 준비 정책을 HWP5 차트의 필수 두 BinData 구조라고 해석하지 않는다. 별도 PNG BinData가 실제 HWP5 OLE fallback과 연결되는 방식은 아직 증명하지 않았다. OLE presentation stream과 별도 그림 제어는 서로 다른 운반 방식이며, PNG를 예약했다는 이유로 어느 쪽의 유효성도 얻지 않는다. 이후 승인 raw의 실제 소유 구조와 공개 규칙으로 운반 프로필을 정하고, 새 파일에서 실제 표시 연결을 증명해야 한다. 선택한 프로필이 별도 PNG 항목을 사용하지 않으면 현재 pair 준비 API도 명시적으로 재검토해야 한다. 불필요한 자원을 추가한 빈/부분 문서를 생성 양성으로 세지 않는다.

## c961 자원 저장·History 연결 소스 후보

이 후속은 foundation3과 ownership3의 기존 소스를 바꾸지 않고, 생성 자원의 소유 store·전체 CFB 추가 저장·기존 checkpoint 경로를 같은 후보에 연결한다. 새 차트 명령은 아직 없으므로 실제 Session에서 store는 비어 있다. Root나 공개 capability에는 연결하지 않는다.

`created_resources.zig`가 DocInfo overlay와 ordinal/physical/path/bytes를 소유하고 checked 합계 예산·깊은 복사·동등 비교·해제를 제공한다. 기존 Session의 checkpoint size/capture/arena clone/Parent 복원/exchange/rollback에 이 값을 함께 전달한다. model/table/background 검증 뒤 chart swap에는 할당이나 실패 작업을 두지 않는다. chart snapshot을 기존 table-only 복원 API에 잘못 넘기면 명시 거부한다. 별도 chart undo stack은 만들지 않는다. 기존 HistoryV2 Adapter가 Session을 통해 이 경로를 사용한다.

`created_resource_write.zig`는 기존 CFB 노드와 metadata를 유지하며 /BinData storage와 새 스트림을 추가한다. 기존 replacement와 Unicode case alias 중복을 검사하고, 원본 CFB 버전으로 strict 재열기한 후 추가 자원 bytes를 확인한다. 기본 지원 한계는 호출당 pending128개이며 초과하면 거부한다. 기존 출력 cap과 CFB 한계를 유지한다. 메모리 bytes 반환이며 실제 디스크 파일 쓰기 검증이 아니다. Session.save는 유효 DocInfo를 기존 압축 정책으로 쓰고 이 추가 저장기를 호출한다. pending이 없으면 기존 rebuildManyExact 경로를 그대로 쓴다. 차트 조회는 pending 자원이 있을 때만 request-local 새 Source로 resource index를 구성한다.

`create_preview.zig`는 실제 authored XML에서 기존 chart/display_values를 추출해 전용 preview DTO와 XML SHA256을 만든다. 가짜 HWPX host/pair를 만들지 않는다. `web/preview/hwp5-chart-create-preview.mjs`는 기존 validateChartDisplayData·chartPreviewPrimitives·paintChartPreview를 사용하고, 호스트가 주입한 실제 Canvas의 PNG encoder 결과만 반환한다. 64..2048 각 변과4M pixels, wire16MiB, PNG8MiB를 명시 지원 한계로 둔다. 도중 current 검사가 실패하면 결과를 버리고 Canvas를 해제한다. encoder 부재를 fixture 이미지나 cached previewValue로 대체하지 않는다. 기존 painter의 approximate 및 SourceStylesNotApplied 경고를 유지한다.

`create_rendered_resources.zig`는 미래 제품 요청이 사용할 자원 준비 입구다. 동일 authored XML 해시, PNG 구조/CRC와 선언/실제 크기를 대조한 뒤 기존 foundation prepare에 전달한다. 테스트용2x1 PNG는 제품 크기 정책에서 거부한다. 기존 raw prepare는 기반 모듈 검사에 유지하지만 미래 Session 명령이 raw fallback 입력을 바로 받으면 안 된다. 해시/형식 검사는 그림과 데이터의 시각 일치를 보증하지 않으며, 신뢰한 renderer와 현재 문서/anchor의 binding 및 OLE fallback 운반 방식은 별도 계약이다. 현재 이 입구도 공개 WASM/Session 명령에 연결되지 않았다.

새 Native 준비는 resource/write/checkpoint/preview7개와 Session 빈 자원 baseline1개로 분리한다. 전자는 자원만 있는 전체 CFB strict 재열기를 포함하지만 실제 차트 생성으로 세지 않는다. 후자는 새 명령이 없는 기존 Session.save/History Adapter의 회귀용이다. 둘 다 컴파일·실행0이다. 기존 foundation9/ownership3도 그대로 미실행이다. Node mock7개는 실제 공통 projector/painter 호출과 PNG encoder·stale·크기·지원 타입 거부를 확인했지만 실제 브라우저 PNG/화면이나 Native 증거가 아니다.

### 남은 게시 경로

다음 제품 파일은 `create_records.zig`(71/76/84의 명시 OLE 프로필), `create_section.zig`(본문 토큰·control subtree·source map), `create_session.zig`(현재 anchor/필드 거부·pending remap·자원과 Section의 단일 게시)다. 아직 이 파일들을 만든 것처럼 집계하지 않는다. 기존 equation_create_session/created_table_host_draft와 source_object_ids의 계약을 재사용하되 OLE24/26바이트 차이를 길이 추측으로 결정하지 않는다.

그 다음 style_preservation의 typed create Command와 변경 후 resource count/cache 무효화를 연결하고, Native preview transport 및 제품 요청의 XML hash/target binding을 연결해야 한다. 실제 OLE presentation과 별도 그림 중 어떤 운반 방식이 지원되는지 승인 raw와 공개 명세로 정하기 전에는 PNG ordinal을 OLE fallback이라고 선언하지 않는다. 새 파일의 실제 차트 owner·DocInfo·BinData·그림 연결, 파일 쓰기 후 fresh reopen, 생성 한 번의 managed undo/redo, 실패 시 기존 유효 redo/전체 saved bytes 보존, 외부 앱/시각 검증은 계속 열린 gate다.

## checkpoint 소유권 후속3: arena와 Parent 경계

별도 `hwp5_chart_checkpoint_ownership_probe.zig`에3개 Native 회귀를 준비한다. 기존 Foundation9/ownership3, 자원 저장/checkpoint/payload7과 빈 Session1에 합치지 않는다. 소스 기준은 c961, 부모 제품 후보는872ac80b이며 이 후속에서는 제품 소스가 모두 바이트 동일하다. HWPX radar 타입/카테고리 정책은 Main 소유로 두며 수정하지 않는다.

첫 번째 회귀는 own Prepared의 실제 DocInfo/OLE/PNG를 빌린 입력으로 사용한다. 입력과 분리한 live 값을 만들고, History용 arena snapshot을 캡처한 뒤 Parent allocator로 복원 값을 깊게 복사한다. Parent의 DocInfo/OLE를 변경하고 교환 두 번과 원 snapshot의 독립 복사/rollback을 거쳐 소유 버퍼가 섞이지 않는지 요구한다. callback의 모든 allocation index를 기존 bounded no-resize harness로 순회하고 각 trial 뒤 live bytes0 및 allocated==freed, 빌린 입력 전체 불변을 검사한다.

두 번째는 snapshot 캡처 이후 chart bytes까지 합친 exact 예산보다1 작은 Parent 복원 요청을 거부하고 중간 복사본을 모두 해제하도록 요구한다. OOM은 별도로 전파하며 LimitExceeded로 바꾸거나 삼키지 않는다. 세 번째는 다른 owner의 복원을 fail_index0 allocator로 요청해 SourceBindingMismatch가 새 할당보다 먼저 발생하고 원 snapshot은 계속 일치하는지 요구한다.

세 회귀는 아직 컴파일/실행하지 않았다. 실제 fail-index trial 수는 미측정이며 per-trial 균형 통과로 선언하지 않는다. 원자적 실제 chart Command, 유효 managed prior redo, 전체 파일 쓰기/fresh reopen 및 시각 fallback은 여전히 별도 미증명 gate다. 이 회귀의 synthetic PNG는 소유 bytes 시험용이며 제품 painter 결과가 아니다.

## 명시 spec24 생성 경로 소스 후속

872ac80b와d9e82b11의 자원/checkpoint 기반 위에 실제 Native `insert_chart` 요청·Section serializer·Session 게시 경로를 작성했다. 이 항목은 소스 준비이며 타입 검사/Native 성공을 뜻하지 않는다. 공개 ABI/SDK/버튼은 활성화하지 않았다. 이전 절의 '생성 Command 없음'은 이전 후보 상태다.

요청은 기본값 없는 `spec24_registered_png_presentation_v1` 실험 프로필을 명시한다. anchor와 전체 expected UTF16LE 문단, 현재 History binding/epoch, 양수 i32 문서 크기, authored data 및 동일 XML hash의 rendered payload가 필요하다. 기존 source protection·field span·원본/물리/현재 모델 mapping·pending 표/배경 remap을 재사용하고, 일반 최상위 문단 외 host는 거부한다. source_object_ids의 문서 전체 instance namespace를 재사용한다.

`create_records.zig`는 gso71→root double-ID $ole76→spec24 OLE84 subtree와 drawing anchor를 새로 쓴다. 16비트 OLE 속성에 상위 kind 비트를 넣지 않는다. `create_section.zig`는 실제 문단 토큰·header·runs/ranges를 변경하고 선택된 subtree를 삽입한다. `create_session.zig`는 source normalization과 원자적 준비를 거쳐 최종 Section serializer에서 실제 owner·크기·ordinal·현재 anchor를 검사한다. pending 표가 최종 직렬화의 물리 node를 바꾸므로 현재 basis의 anchor 검사와 최종 출력의 fresh projection 검사를 나눈다.

제품 자원 경로는 예전 OLE+PNG pair가 아닌 한 개 STORAGE BinData를 추가한다. `create_single_ids.zig`/`create_single_docinfo.zig`가 ordinal과 physical ID를 별도로 계획하고, 링크·모든 CFB 직접 자식·Unicode alias/orphan 점유와 count를 검사한다. count65534의 마지막 ordinal65535를 허용하고65535 및 usize overflow는 거부한다. DocInfo count는1 증가하며 기존 레코드를 보존한다. pair foundation3은 역사/회귀용으로 바이트 동일하게 유지한다.

`create_single_asset.zig`는 authored XML과 실제 painter PNG를 새 OLE 안의 OOXMLChartContents와 `\x02OlePres000`에 넣고 strict 재열기/정확한 bytes를 검사한다. 별도 미연결 PNG BinData를 생성하지 않는다. `create_png_presentation.zig`의 등록 PNG clipboard 형식은 MS-OLEDS2.3.1/2.3.4와2.1.1의 허용에 기초한 명시 제품 선택이다. ANSI 길이4/PNG+null, target device 없음, content aspect, lindex-1, PRIMEFIRST, pixel width/height와 실제 data length를 쓴다. 이것이 HWP 앱의 지원 형식이라는 관측 증거는 없다. 외부 호환·시각 fallback gate는 그대로 열린다. 공식 출처: [OLEPresentationStream](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleds/78ab0f5c-ad1b-41b4-bb5e-1eea2cd13a6c), [Clipboard Formats](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleds/61600edc-470c-457f-9fa0-79868d518514), [LengthPrefixedAnsiString](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleds/fc725b5a-bc3e-4ff2-89e9-1dcd1092d497).

Session은 private prospective State에서 포인터 배열만 복사해 실제 save를 먼저 호출한다. `create_verify_file.zig`가 전체 HWP를 fresh open하고 DocInfo ordinal→physical STORAGE·압축 정책·정확한 BinData bytes·본문 OLE owner를 검사한 뒤에만 Section/table/background/resource를 함께 교환한다. fallible work는 모두 교환 전이다. HistoryV2의 기존 checkpoint 경로가 이 네 값을 소유하며 별도 undo stack을 만들지 않는다.

현재 공개 조회의 기본 observed26 가정은 바꾸지 않았다. Native의 `hwp5ChartCandidatesWithLayout`/`hwp5ChartDisplayWithLayout`에서 spec24를 명시해야 이 실험 출력을 읽는다. 혼합24/26 문서를 자동 판정하지 않는다. 공개 transport에 올리기 전 per-owner 명시 layout 계약이 남아 있으며 기본 조회로 생성 양성을 선언하지 않는다.

승인 own raw77c의 이전 경로는 이번 확인 시 FileNotFound였다. 파일 내용을 새로 열거나 관측26을 재검증하지 못했고 다른 raw나 외부 구현으로 대체하지 않았다. spec24와 root double-ID는 공개 명세 및 기존 own reader 계약에 기반한 선택이며 raw77c 관측 결과라고 표기하지 않는다.

새 Native 준비5개는 실제 Command→파일 쓰기/읽기→fresh Session·실제 chart owner/OOXML literal·명시 presentation→managed undo/redo 전체 bytes, stale rendered hash와 expected source text 거부 각각의 valid prior redo/전체 saved bytes, 마지막 단일 ordinal/overflow, detached asset retained cap exact/+1 및 원본 보존이다. 테스트용64x64 PNG는 독립 synthetic transport 입력으로만 사용하고 제품 모듈이 import하지 않는다. 실제 painter 출력의 시각 증거로 세지 않는다. full Command의 OOM sweeps·모든 source preservation/adversarial cohort와 외부 앱 검증은 아직 남아 있다.

집중 슬롯은 이제 이 Native5 진입점에서 실제 생성·저장·재열기·managed History의 새 증거를 낼 수 있다. 아직 컴파일/실행하지 않았다. 기존 pinned compiler binary는0.17.0이고 설치본과 SHA256이 동일하지만 이전 고정 위치의 `zig env`는 설치 디렉터리 오류로 실패한다. 실행 전에 명부의 명시 library 경로와 library 핀을 확인해야 한다. fmt/AST-only/literal import 검사는 컴파일 또는 타입/동작 검증이 아니다.
