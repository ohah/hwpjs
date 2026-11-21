# HWP5 차트 데이터 편집 계약

이 문서는 HWP5 차트 값과 범주 편집의 지원 범위, 원본 소유권, 저장과 검증 경계를 소유한다. exact `176a14bfbb893fe036d89e904feb0417edf856a5`의 공식 Core/Vanilla/public/gallery와 WASM `9f383a8c3c16d85570e4a994a92e5468d74238f7150b6917f897f349713bbe45`를 사용한 격리 SDK와 실제 브라우저 검증을 아래에 기록한다. Root 반영, npm 게시 또는 공개 배포 완료를 뜻하지 않는다. 기존 HWPX 데이터 편집과 HWP5 읽기 및 생성은 각각의 계약을 유지한다.


## 표준 2D 원형 리터럴 소스 후보

exact `338723f1a1c49b8564942f3ddb884bfa07681df2`에서 분리한 후속은 own 생성기의 정확한 표준 2D 원형 한 계열만 허용한다. 원본과 수정 XML 전체를 기존 생성기로 재생성해 바이트가 같아야 한다. 기존 owner·보호·field·자원·ticket 검사를 유지하며 스타일, 계열·범주 개수와 계열 이름은 편집하지 않는다.

원형에서는 기존 `create_pie_admission`을 canonical 재생성으로 재사용한다. 음수, 전부 0, 원문 nonzero가 binary64 0이 되는 값과 표현 불가능한 양의 부채꼴을 preview/commit 공통 준비 단계에서 거부한다. NaN과 무한대도 기존 숫자 문법을 통과하지 못한다. UI draft와 공개 edit의 expected/value는 문자열 그대로 유지하며, 원형에서만 전체 수정 후 벡터를 숫자 변환 전에 검증한다. 거부된 UI draft를 삭제하거나 0으로 바꾸지 않는다. 기존 세 프로필과 HWPX에는 이 원형 정책을 적용하지 않는다.

소스 회귀에는 불변 own 공개 fixture `f0419e00552b521c72188064820ddf5a0b268a37e5cc24a18c8dfd510f4619fd` 11776바이트, 범주 가/나/다와 값 1/2/3을 사용한다. COW 원본 자원·geometry 유지, 기본 저장 거부, 명시 저장/재열기, undo/redo, 거부 후 이전 redo를 준비한다. Native의 시험 PNG는 기존 합성 transport 입력이며 제품 fallback이나 실제 painter 증거가 아니다. 실제 Native·WASM·SDK 저장·Worker PNG·GUI 검증은 아직 실행하지 않았다.

## 가로 묶은 막대 편집 소스 후속

`spec24_clustered_horizontal_bar_literals_v1`은 own 가로 생성기의 정확한 2D `barChart` / `bar` / `clustered` 직렬화만 대상으로 한다. 리터럴 capability version3은 기존 세로 막대와 꺾은선도 유지하며, version1/2 엔진에서는 가로 리터럴을 거부한다. optional ABI의 함수 및 wire schemaVersion1은 유지한다. Native는 plot 방향으로 프로필을 구분한 뒤 편집 전후 canonical 전체 바이트를 재검증한다. JS는 lease/preview 프로필과 가로 방향을 확인하고 기존 private Worker painter, COW, 단일 History, 저장 거부 정책을 재사용한다. 사용자나 화면 데이터가 프로필 또는 PNG를 지정할 수 없다.

공통 series/category grid에는 방향별 분기를 추가하지 않는다. 값과 범주 이름만 바꾸고 계열 이름·개수와 범주 개수, 스타일·종류·방향·크기는 바꾸지 않는다. 일반 읽기나 painted hit는 편집 권한이 아니다. stacked/percentStacked/3D/혼합 plot, 누락 방향, 외부 workbook, unknown 스타일과 stale 원본은 계속 거부한다.

이 후속의 Native 시험은 소스 준비이며 실행 완료가 아니다. 자체 생성 입력과 공개 134번 own 예제의 값·범주, 단일 History/undo/redo, COW/재열기, 실패 원자성과 할당 실패 검사를 별도로 준비한다. 실제 SDK, Worker PNG, 독립 저장 비교와 GUI의 가로 편집 성공은 후속 실행 증거가 필요하다. 기존 아래 세로·꺾은선 증거와 합산하지 않는다.

## 현재 제품 연결

대상은 Native가 현재 문서에서 소유권과 원문을 다시 검증한 자체 생성기 템플릿과 일치하는 spec24 표준 2D 세로 묶은 막대 또는 표준 꺾은선 차트다. 읽어서 표시할 수 있는 모든 HWP5 차트가 편집 가능한 것은 아니다. 현재 일반 본문 root의 소유자, 원본 XML, 자원과 보호 조건을 모두 통과해야 한다. 값과 기존 범주 이름을 수정하며 계열 이름, 계열 수와 범주 수는 변경하지 않는다. 임의 스타일, 다른 차트 종류, 혼합 차트, 크기나 위치 변경과 완전 재조판은 이 기능에 포함되지 않는다.

Core의 `createHwp5ChartDataEditor(editor)`는 현재 상태에서 `presentation()`, `targets()`, `capture(target)`, `current(capture)`, `apply(capture, edits)`를 제공한다. 실제 OffscreenCanvas painter가 있는 내장 Worker의 검증된 모듈과 private transport 관측, History protocol2, 현재 전체 HWP5 view와 실제 원본 소유자를 요구한다. capability boolean이나 직렬화한 State/lease만으로 승인하지 않는다. 모듈을 직접 compile하거나 위조한 상태는 거부한다. `presentation()`은 사용할 수 없으면 false와 사유를 반환하고, `targets()`와 `capture()`는 거부 오류를 낸다.

내장 Reader와 Worker는 같은 private read-source lifecycle을 사용한다. 문서나 변경 요청이 await에 들어가기 전에 이전 scope를 폐기하고, 검증된 새 응답으로만 현재 상태를 게시한다. mutation과 undo/redo의 Core revision 재예약은 정확한 요청 context와 새 publication에 묶는다. 저장 완료는 내용과 문서, operation/view가 같은 경우에만 관측을 상속한다. 변경 없음이나 예측 가능한 거부 뒤에는 검증된 unchanged 응답, 같은 요청 fence와 Native read binding의 정확한 재조회가 모두 맞을 때 새 scope를 발급한다. 이전 상태의 권한을 되살리지 않으며 redo를 실행해 복원하지 않는다.

Worker는 capture에 묶인 Native preview를 받아 실제 OffscreenCanvas와 공용 painter로 PNG를 만든다. preview, paint, blob, arrayBuffer의 비동기 단계와 commit 직전 현재성을 다시 확인한다. 공개 apply는 값과 범주 변경만 받으며 호출자 PNG, 임의 painter, trusted flag를 받지 않는다. 선택형 export와 portable wire 계약은 [ABI 문서](hwp5-chart-literal-edit-abi.md), 사용자 조작은 [데모 안내](../apps/docs/docs/guide/demo.md#hwp5-기존-차트-데이터-편집)를 따른다.

일반 in-process Reader는 실제 Worker painter가 없으면 같은 모듈과 파일을 읽더라도 차트 데이터 편집 capability가 비활성화될 수 있다. Reader의 비활성 결과로 Worker 데모의 qualification을 추정하지 않는다. 공개 `hwp5-chart-create.hwp`는 생성과 미리보기 예제로만 연결하며 위의 승인 입력과 동일 파일이 아니다. 공개 예제 자체의 Worker 편집 성공이나 공개 배포를 이 검증으로 주장하지 않는다. 실제 Worker에서 지원하는 2D 차트를 직접 만들고 저장해 다시 연 뒤 현재 편집 버튼의 활성 여부를 확인할 수 있다.

## Native 요청과 소유권

`src/hwp5/chart/literal_edit_request.zig`의 `Plan`은 Native가 검증한 `spec24_clustered_column_literals_v1` 또는 `spec24_standard_line_literals_v1` profile, 현재 `HistoryTicket`, 선택 소유자들의 전체 `ole_sites.Site`, physical ID, 자원 SHA256, 원본 XML SHA256과 리터럴 편집 목록을 받는다. `Session.hwp5ChartLiteralEditPreview`는 새 XML hash, 기존 PNG pixel 치수, 공통 chart display data와 `executionAuthority:false`를 반환한다. `Command.edit_chart_literals`는 같은 Plan과 명시 rendered PNG를 받는다. 요청 데이터는 호출 동안 빌리며 Session에 보관하지 않는다.

숫자 값은 `{series,category,expected,value}`, 범주 이름은 `{category,expected,value}`이다. series/category 수와 series 이름은 바꾸지 않는다. 범주 이름 하나는 모든 series의 대응 category leaf span으로 확장한다. 현재 literal 값과 expected가 다르면 거부한다. 논리 키 중복, 잘못된 인덱스와 숫자, 오래된 epoch·owner·자원·XML은 거부한다.

소유자는 최대128개, 리터럴 요청은 최대20480개, expected와 value의 합계는4MiB다. 숫자 문자열은 각각128바이트, 범주 문자열은 각각4096바이트다. 차트 shape 자체의 기존 series64/category4096/points16384/XML8MiB 한계도 유지한다. 문자열·누적 예산은 빼기 전에 검사하므로 overflow를 통한 초과 허용이 없다. 이 제한의 구조 검사는 실제 현재 소유권 증명과 별개다.

선택 소유자는 같은 물리 자원과 SHA를 가져야 한다. spec24/attributes1/꼬리 없음/비영 ordinal·instance ID만 허용한다. Native가 다시 얻은 전체 Site와 대조하며 본문 root 문단만 허용한다. 같은 구역의 중복 instance ID는 거부한다. 기존 source protection과 모든 readable field span을 검사한다. 필드 속성 비트를 해석해 허용하거나 source/current unit을 UI anchor로 재해석하지 않는다. 잠금·배포·서명·변경 이력 등 기존 저장 불가 기능은 거부한다.

## XML·PNG·컨테이너 경계

소스 XML은 현행 own `chart_create_xml.create`의 2D clustered column 직렬화와 정확히 일치해야 한다. 해석된 모델을 재직렬화한 바이트 동등성으로 unknown 스타일·구조·외부 workbook·다른 profile을 거부한다. 변경은 기존 `chart_point_write`를 사용한 정확한 leaf span 교체다. 바꾼 XML도 같은 canonical profile을 다시 증명한다. 임의 기존 차트의 편집 지원을 주장하지 않는다.

내부 OLE는 size-prefix CFB의 `/OOXMLChartContents`와 `/\x02OlePres000` 두 스트림만 허용한다. 미지 스트림·storage·legacy Contents는 편집 대상에서 거부한다. 기존 PNG presentation header, PNG 구조·CRC,64..2048 치수와4M pixel cap을 검증한다. 변경에는 새 XML hash에 묶이고 기존 pixel 치수와 같은 명시 PNG가 필요하다. 값이 같은 no-op은 rendered가 없어야 하며 History 변경을 만들지 않는다. no-op에 PNG만 붙이는 요청은 거부한다.

hash와 CRC는 painter의 진위를 증명하지 않는다. 제품 연결은 Native preview를 실제 shared chart model painter에 전달하고 결과를 현재 Worker owner/epoch와 묶어야 한다. Native 테스트의 own64 PNG는 명시 transport 입력일 뿐 제품 기본 그림이나 실제 그림 내용의 증거가 아니다.

## 원자적 저장과 History

항상 그룹 단위 copy-on-write를 사용한다. 기존 DocInfo에 uncompressed BinData 행 하나를 추가하고 새로운 physical path 하나를 만든다. 선택한 소유자들의 tag84 payload에서 ordinal2바이트만 바꾸고, 원본 자원과 선택하지 않은 alias의 ordinal은 유지한다. 새 OLE는 기존 내부 컨테이너 메타데이터를 보존하며 XML과 PNG presentation만 교체한다. pending chart 자원과 원본 자원의 경로·ID 충돌을 함께 검사한다. pending entry 수128 제한을 유지한다.

선택 Section은 deep clone하며 문단·표·서식 등의 기존 semantic intent를 보존한다. source basis만 같은 크기로 수정한다. prospective State의 section/decoded/style-offset 배열은 독립 배열을 사용한다. 실제 Session save 경로에서 전체 HWP 초안을 만든 다음 fresh Source로 재열어 검증한다. DocInfo는 예상 append 결과와 정확히 같아야 하며 새 resource를 다시 읽어 ID와 bytes를 검사한다. 기존 directory metadata, 모든 비대상 stream, 원본 자원과 비선택 alias를 보존한다. 선택 Section도 저장 전 materialized Section에서 예상 ordinal만 바뀐 바이트와 비교한다.

모든 검증 후 Section과 `chart_resources`를 한 번 교환한다. 이 값들은 기존 History checkpoint deep clone/equality/restore에 포함되어 한 이벤트로 undo/redo된다. 실패는 게시 전에 반환한다. History 자체의 실패 rollback/epoch 규칙을 유지하며 유효 prior redo 보존은 별도 회귀 대상이다. 기본 save의 `LayoutReflowRequired` 정책을 바꾸지 않는다. Native 내부 초안 검증에는 기존 명시 `allow_stale_layout:true`를 사용하며 사용자 저장 동의는 위의 실제 저장 정책을 따른다.

## 실제 검증과 제한

소스 lifecycle/Core 회귀는 40/40, skip0이다. 공식 Core와 Vanilla JS, public 선언 및 runtime, gallery producer는 각각 exit0으로 종료했다. 동일 바이트 직접 compile과 unknown module을 거부하는 profile 시험은 2/2이다. normal package-name import를 사용한 실제 Native Reader 시험에서 두 번째 본문 편집, undo/redo, 저장 후 관측, fresh reopen과 검색, 예측 가능한 차트 거부 뒤의 동일 내용과 prior redo 보존이 통과했다. 최초 runtime 명부는 3/4이며 마지막 위조 상태 시험의 harness가 `targets()`의 정상 거부 예외 대신 빈 배열을 기대했다. 이를 보존하고 별도 단일 시험에서 presentation false, 정확한 targets 예외와 capture 거부를 1/1로 확인했다. 두 결과를 같은 cohort의 4/4로 바꾸지 않는다.

실제 전용 브라우저의 fresh load에서 차트를 더블클릭하고 **차트 데이터 편집**을 열었다. 기존 값 `20`을 `73`, 범주 `항목 2`를 `항목 2-N9`로 수정해 **변경 일괄 적용**을 한 번 눌렀다. Native revision은 `0 -> 1 -> undo 0 -> redo 1`이었다. Worker의 native OffscreenCanvas와 `renderHwp5ChartLiteralEditPreview`, `renderPreview`, `paintChartPreview` 실행을 각각 1회 관측했다. 함수 대체, caller PNG 또는 가짜 Canvas를 사용하지 않았다.

기본 저장은 `LayoutReflowRequired`로 거부되고 다운로드는 없었다. 사용자가 **줄 배치가 달라질 수 있는 HWP 저장 허용**을 직접 선택한 뒤 저장했다. 이는 기존 `save({ allowStaleLayout: true })` 정책이며 줄 배치를 재계산하는 옵션이 아니다. 내려받은 파일의 fresh reopen과 다시 연 데이터 grid에서 `10/73/40` 및 `항목 2-N9`를 확인했다. 원본 차트 크기나 임의 스타일 편집, 외부 한글 프로그램의 상호운용 완료로 확대하지 않는다.

공식 gallery manifest SHA256은 `4f0c35c2fa294abd664c399a5b764c44591058b50902dfa20f9356ec58258d08`, 실제 Worker SHA256은 `14db9bd7c967d4c1712c76f94722a1c4c71107c059049dc4462e22b98be96574`다. 승인 입력은 13,824바이트 SHA256 `681855503c0955301636bf938ab2678dcdec25a0201edb830964cd93b9e22fbf`, 저장 결과는 25,600바이트 SHA256 `18452e6f76a8c2eac726d836f11011295f58e2c3280a4e51022f3713c8708a24`다. binary를 문서 패치나 공개 fixture 목록에 추가하지 않는다.

Peirce의 별도 독립 raw oracle은 위의 승인 입력과 저장 결과에서 첫 positive 1회 PASS와 잘못된 값 `74`, 잘못된 이전 범주 `항목-N9`의 음성 2회 거부를 확인했다. 기대값은 저장 결과를 읽기 전의 Native capture와 trusted UI 입력 및 적용 전 초안에서 정했다. before만으로 physical2와 ordinal2를 계획했으며 원본 `BinData/BIN0001` 보존, 새 `BinData/BIN0002` COW, DocInfo append와 선택 OLE ordinal의 정확한 변경, 비대상 stream과 XML 나머지 바이트 보존을 확인했다. XML은 숫자와 범주의 두 구간만 변경됐고 PNG는 기존 267x160 치수와 CRC를 유지하면서 decoded pixels가 달라졌다. 이는 시각적 정확성, Runtime 권한, History, OOM 또는 외부 상호운용을 독립 raw 검사만으로 증명한다는 뜻이 아니다. apply request payload를 직접 관측했다고 주장하지 않는다. GUI undo/redo는 실제 화면과 Native 응답으로 확인했으며 각각의 별도 HWP 저장 파일을 만들었다고 주장하지 않는다. 실제 GUI의 apply는 한 번이고 두 번째 차트 apply는 이 cohort에 포함하지 않는다. 소유 browser/server는 전체 PG terminal과 세션 inactive, 포트 종료를 확인했고 source/dependencies/raw/WASM 및 gallery 전후 핀은 동일했다.

## 최초 Native 후보의 준비 기록

`src/hwp5_chart_literal_edit_probe.zig`는 synthetic own 입력만 사용하는 집중 Native 명부다. 데이터·범주 편집, multi-series 범주 확장, 중복·unknown XML 거부, 실제 파일 write/read/fresh reopen, pending와 재열기 원본, 단일 History와 전체 saved bytes undo/redo, 선택/그룹 COW, no-op·PNG-only·누락 PNG, stale owner/XML/PNG, exact/+1 요청 예산과 유효 prior redo를 준비한다. allocation-failure sweep은 별도 필터로 구분한다. 테스트를 준비했다는 사실은 실행 통과와 다르다.

검증 순서는 source fmt/AST와 정확한 diff 검사 → 별도 승인된 집중 Native → 실제 shared painter payload를 이용한 독립 raw oracle → 별도 optional ABI/JS/SDK/Worker → GUI/save/reopen이다. 최초 db614 후보에는 ABI export, schema, JS, SDK와 UI 변경이 없었다. 이후 연결과 실제 결과는 위의 현재 계약과 검증 문단을 따른다. 이 준비 명부 자체를 전체 Native, protection/field 음성 cohort 또는 전체 OOM sweep의 통과 증거로 사용하지 않는다. 실행 명령과 pin·슬롯 gate는 격리 패킷 `EXECUTION-PLAN.json`에서 관리하며 자동 실행하지 않는다.
