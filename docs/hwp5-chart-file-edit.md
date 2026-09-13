# HWP5 실제 차트 파일 편집

## typed 계약

`src/hwp5/container/chart_edit_session.zig`의 typed 함수들은 HWP 파일에서 실제 DocInfo `BinData` 순번 하나를 선택하고, 해당 OLE의 루트 `/Contents`를 명시된 observed chart layout으로 파싱한 뒤 Font 이름 alias, Text alias/null 또는 nullable TextFormat의 null code를 새 String object로 분리·생성합니다. Font 대상은 primary/secondary axis title, series main label, series point label과 series suffix block입니다. Text 대상은 series main/suffix label alias, secondary-axis null title과 null point label입니다. TextFormat code 대상은 series suffix의 두 slot입니다. caller는 1-based DocInfo 순번·storage 배치·OLE envelope 배치·차트 구조 count·대상 index·새 raw string bytes와 trailer만 지정합니다. 이 계층은 encoding을 UTF-8로 강제하거나 변환하지 않습니다. 물리 storage ID, CFB 경로와 새 chart object ID는 API가 실제 파일에서 유도합니다.

새 ID는 `chart_object_id_allocator.findLowestAvailable`이 기존 chart object table을 기준으로 선택하고, Font 이름에서는 enclosing Font ID도 제외합니다. 실제 String fork와 Contents extent 갱신은 기존 `chart_contents_string_fork`가 소유합니다. 두 공개 함수는 대상만 tagged union으로 전달하고 파일 개방·검증·파싱·저장 경로는 내부 `forkString` 하나를 공유합니다. 결과 Contents는 [파일 단위 OLE 편집 세션](hwp5-ole-edit-session.md)의 `/Contents` replacement 하나로 전달되며, 내부 OLE와 바깥 HWP의 원자적 저장 규칙을 그대로 사용합니다.

차트 adapter는 의미 편집 전에 같은 불변 HWP의 Header·DocInfo·BinData·내부 OLE·Contents를 직접 검증합니다. 하위 OLE 세션과 HWP batch의 재검증은 방어 계층이며 별도 경로 추측이나 object ID 상태를 만들지 않습니다. `max_contents_bytes`는 원본 Contents, `max_edited_contents_bytes`는 fork 결과를 제한하고 하위 세션의 decoded/OLE/encoded/최종 HWP 한도도 모두 적용됩니다.

`applyStringEdits`는 typed target variant를 한 배치에 조합합니다. 기존 alias인 다섯 Font 위치군과 두 Text 위치군은 독립 String으로 fork하며, 두 null Text 위치군과 한 null TextFormat code 위치군은 `0xffffffff` sentinel을 새 inline String 정의로 materialize합니다. axis scale의 outer null은 `ValueBlock`이 소유한 정확한 optional span을 새 TextFormat 객체와 필수 code String 객체로 함께 바꿉니다. 각 객체에는 서로 다른 새 object ID를 배정하고, 삽입 지점보다 뒤에서 처음 선언되던 `VtTextFormat`을 섣불리 참조하지 않도록 새 type ID와 선언도 그 자리에서 생성합니다. 각 공개 target은 내부 `Resolved` 분기 하나로만 정규화됩니다. 빈 배치와 `max_edits` 초과를 파일 개방 전에 거부하고, 한 번 파싱한 원본 Contents에서 모든 target을 해석합니다. 새 ID는 명령 배열 순서가 아니라 원본 wire offset 순으로 예약하며 모든 enclosing ID와 앞서 예약한 ID를 제외합니다. 요청 배열 역시 wire 순서로 연속 구성하고 `chart_contents_string_fork.forkMany`가 중복 ID를 거부한 뒤 원본 좌표 patch를 한 번만 적용합니다. 중복 대상은 overlapping patch로 거부되므로 부분 결과는 저장되지 않습니다.

`applyCharts`는 엄격히 증가하는 DocInfo BinData 순번별로 OLE layout, chart layout과 typed String edit 배열을 받습니다. FileHeader와 DocInfo는 한 번 읽고 `inspectBinDataOrdinals`가 모든 실제 resource를 동시에 선택합니다. 각 BinData의 압축 해제·OLE `/Contents` 파싱·의미 편집 결과가 전부 준비된 뒤에만 기존 `ole_edit_session.apply`를 한 번 호출하므로 바깥 HWP CFB도 한 번만 재작성됩니다. 단일 차트 API들은 모두 이 함수의 한 명령 wrapper입니다.

다중 준비 단계에는 항목별·전체 decoded BinData 한도와 항목별·전체 edited Contents 한도를 적용합니다. `max_total_edited_contents_bytes`는 하위 OLE 전체 결과 한도와 구분됩니다. 각 결과와 command/replacement backing 배열은 최종 세션 호출까지 소유하며, 성공한 HWP 외에는 실패 시 모두 해제합니다.

## 실제 검증

SHA-256가 고정된 9,876바이트 실제 Contents를 내부 CFB v4에 넣고, 이를 유효한 압축 DocInfo와 raw-DEFLATE OLE BinData를 가진 바깥 HWP CFB v3에 연결합니다. typed API로 primary axis 0의 title Font 이름과 series 0의 main-label 본문을 각각 수정한 뒤 최종 HWP·BinData 압축·내부 OLE·Contents를 모두 다시 열어 새 최저 object ID, raw bytes, trailer, 양쪽 CFB version과 내부·외부 형제 stream 보존을 확인합니다.

axis 범위 밖, 원본 Contents 한도, 편집 Contents 한도와 잘못 선택한 size-prefix envelope는 typed API 경계에서 정확한 오류로 거부합니다. 실제 fixture의 초기 BinData도 FileHeader 기본 압축 정책과 일치하는 raw DEFLATE로 저장해 합성 전제 불일치를 허용하지 않습니다.

적대적 검증은 축 index 이동, BinData 순번 이동, `/Contents` 대신 형제 stream 선택, 기존 Font ID 재사용, 편집 전 Contents 저장의 다섯 결함을 각각 주입했습니다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 총 15회에서 모두 실제 파일 round-trip 검사가 결함을 검출했으며, 컴파일 실패는 통과로 세지 않았습니다.

series label 확장 뒤에는 공개 wrapper를 axis 대상으로 오배선, series index 이동, 기존 String ID 재사용, point label 본문으로 오선택, 편집 전 Contents 저장의 다섯 결함을 별도로 주입했습니다. 세 최적화 모드의 15회가 모두 컴파일된 테스트 실패로 검출되었습니다.

동일 차트 배치에는 wire 순서 대신 명령 순서로 ID 배정, 첫 ID 예약 누락, 첫 요청만 writer에 전달, 원본 좌표 patch 정렬 제거, 편집 전 Contents 저장의 다섯 결함을 주입했습니다. `Debug`, `ReleaseSafe`, `ReleaseFast` 15회 모두 컴파일은 성공하고 실제 round-trip 검사가 실패했습니다. 정상 검사는 axis와 series 명령을 wire 역순으로 전달하고 두 새 ID·문자열과 내외부 형제 stream을 함께 확인합니다. writer 배치는 빈 요청·새 ID 중복·대상 중복을 별도로 거부하며 allocation-failure 전수 검사에 포함됩니다.

여러 차트 배치에는 두 번째 OLE command 누락, 두 번째 차트에 첫 차트의 의미 명령 적용, typed Contents 누적 한도 갱신 누락, 편집 결과 대신 바깥 HWP bytes를 `/Contents`로 전달, 두 번째 outer ordinal을 첫 ordinal로 오배선하는 결함을 주입했습니다. 세 최적화 모드의 유효한 15회가 모두 컴파일 뒤 실패했습니다. typed decoded 누적 갱신을 제거한 변형은 하위 OLE 세션의 같은 누적 한도가 동일 오류로 거부해 변이 검출 수에서 제외했습니다. 정상 fixture는 압축 DocInfo의 서로 다른 두 OLE BinData를 편집하고 두 내부 CFB v4, 바깥 CFB v3, 모든 형제 stream과 서로 다른 의미 변경을 끝단에서 확인합니다. multi-chart 전체 성공 경로도 모든 allocation failure 위치를 순회합니다.

point-label null materialization 전에는 실제 고정 Contents의 12개 point를 계수해 null 12, alias 0, inline 0임을 실측했습니다. writer는 null span이 정확히 4바이트 sentinel인지 다시 확인하고, non-null body를 null API로 전달하면 거부합니다. 새 결과는 inline 상태·새 최저 ID·raw bytes·trailer로 재파싱되며 동일 차트의 axis/series/point 세 변경 batch와 allocation-failure 순회에도 포함됩니다. point index 이동, 기존 Font ID 재사용, series main-label body 오연결, null을 기존 object lookup으로 처리, sentinel byte 검증 우회의 다섯 변형을 세 모드에서 주입한 유효한 15회가 모두 실패로 검출됐습니다.

실제 문자열 inventory 회귀 검사는 Font를 alias 23/inline 3, Text를 null 13/alias 6/inline 6으로 고정합니다. TextFormat은 axis scale의 객체 자체 부재 3개와 series suffix NullableTextFormat code null 6개를 구분하며, 후자의 code는 alias/inline 0개입니다. 23개 Font alias는 primary axis 4, secondary axis 1, 세 series의 main/suffix Font 6과 point Font 12입니다. 이 23개 전부를 고유 trailer의 한 파일 batch로 fork하고 모든 위치를 재파싱합니다. secondary를 primary로 연결, series main index 이동, point index 이동, suffix series index 이동, 공통 Font trailer 폐기의 다섯 변형은 세 모드의 유효한 15회에서 모두 검출됐습니다.

TextBlock 확장은 secondary-axis null title 1개와 세 series suffix alias 3개를 역순 batch로 저장하고 inline 상태·bytes·고유 trailer를 모두 재검증합니다. nullable block은 enclosing TextBlock ID도 새 ID 후보에서 제외하며, null/non-null writer variant를 교차 사용하면 명시적으로 거부합니다. secondary를 suffix에 오연결, suffix index 이동, alias/null writer variant 상호 뒤바꿈, 공통 trailer 폐기의 다섯 변형은 세 모드 15회에서 모두 검출됐습니다. 이로써 실제 inventory의 null Text 13개와 alias Text 6개는 모두 typed 경로를 가집니다.

TextFormat code 확장은 세 series의 두 nullable slot, 총 6개 null sentinel을 한 batch에서 materialize하고 각 inline code bytes와 고유 trailer를 재검증합니다. enclosing TextFormat object ID는 새 String ID 후보에서 제외합니다. series index 이동, 두 format slot 뒤바꿈, trailer 폐기, 기존 object lookup 강제와 sentinel ID 손상의 다섯 변형은 세 모드 15회에서 모두 검출됐습니다.

axis scale의 3개 outer null은 TextFormat 객체 전체와 그 code String을 한 batch에서 생성합니다. 명령은 axis 2, 0, 1 순으로 주어도 wire 순서로 서로 다른 object/type ID를 예약하며, 저장 후 raw word·code bytes·고유 trailer·두 객체 ID의 분리를 재파싱해 확인합니다. serializer는 원본 4바이트 null span, 기존 object/type ID 충돌과 같은 배치의 ID 충돌을 거부합니다.

전체 객체 생성에는 axis index 이동, raw word 변조, format/code object ID 중복, type 선언 종단 NUL 손상, `VtObject` 대신 `VtValue` 기록의 다섯 결함을 주입했습니다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 유효한 15회가 모두 컴파일 뒤 실제 재파싱 또는 끝단 필드 검증에서 실패했습니다. 이 과정에서 wire 순서와 원래 명령 인덱스를 섞어 아직 초기화되지 않은 요청 슬롯을 조회하던 배치 구성 결함도 실측해, 요청 배열을 wire 순서로 연속 구성하는 단일 규칙으로 수정했습니다.

## 남은 범위

현재 typed 대상은 observed V6 차트에서 실제 alias로 관측된 Font 23개 전체, non-inline Text 19개 전체, 존재하는 nullable TextFormat의 null code 6개 전체와 axis scale의 부재 TextFormat 3개 전체이며, 같은 차트와 여러 차트/BinData 모두 원자적 batch로 조합할 수 있습니다. 실제 fixture의 footnote/legend/root-title Font와 primary-axis/root-title Text는 inline이므로 기존 alias fork 대상으로 취급하지 않습니다. 이미 inline인 target 교체는 실제 편집 근거와 공유 참조 영향 계약 없이 지원한다고 주장하지 않습니다. chart layout은 opaque wire 값에서 추측하지 않으며 caller가 신뢰할 수 있는 구조 count를 명시해야 합니다. 차트 렌더링·수식 재계산·한글 프로그램과의 시각 동일성은 이 저장 성공으로 증명되지 않습니다.
