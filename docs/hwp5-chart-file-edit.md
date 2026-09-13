# HWP5 실제 차트 파일 편집

## typed 계약

`src/hwp5/container/chart_edit_session.zig`의 `forkPrimaryAxisTitleFontName`과 `forkSeriesLabelBodyText`는 HWP 파일에서 실제 DocInfo `BinData` 순번 하나를 선택하고, 해당 OLE의 루트 `/Contents`를 명시된 observed chart layout으로 파싱한 뒤 primary-axis title Font 이름 또는 series main-label 본문 alias를 독립 String object로 분리합니다. caller는 1-based DocInfo 순번·storage 배치·OLE envelope 배치·차트 구조 count·대상 index·새 UTF-8 bytes와 trailer만 지정합니다. 물리 storage ID, CFB 경로와 새 chart object ID는 API가 실제 파일에서 유도합니다.

새 ID는 `chart_object_id_allocator.findLowestAvailable`이 기존 chart object table을 기준으로 선택하고, Font 이름에서는 enclosing Font ID도 제외합니다. 실제 String fork와 Contents extent 갱신은 기존 `chart_contents_string_fork`가 소유합니다. 두 공개 함수는 대상만 tagged union으로 전달하고 파일 개방·검증·파싱·저장 경로는 내부 `forkString` 하나를 공유합니다. 결과 Contents는 [파일 단위 OLE 편집 세션](hwp5-ole-edit-session.md)의 `/Contents` replacement 하나로 전달되며, 내부 OLE와 바깥 HWP의 원자적 저장 규칙을 그대로 사용합니다.

차트 adapter는 의미 편집 전에 같은 불변 HWP의 Header·DocInfo·BinData·내부 OLE·Contents를 직접 검증합니다. 하위 OLE 세션과 HWP batch의 재검증은 방어 계층이며 별도 경로 추측이나 object ID 상태를 만들지 않습니다. `max_contents_bytes`는 원본 Contents, `max_edited_contents_bytes`는 fork 결과를 제한하고 하위 세션의 decoded/OLE/encoded/최종 HWP 한도도 모두 적용됩니다.

`applyStringEdits`는 두 typed 대상을 한 배치에 조합합니다. 빈 배치와 `max_edits` 초과를 파일 개방 전에 거부하고, 한 번 파싱한 원본 Contents에서 모든 target을 해석합니다. 새 object ID는 명령 배열 순서가 아니라 원본 wire offset 순으로 예약하며 모든 대상 Font ID와 앞서 예약한 ID를 제외합니다. `chart_contents_string_fork.forkMany`는 새 ID 중복을 거부하고 원본 좌표 patch를 정렬한 뒤 한 번만 extent를 갱신합니다. 중복 대상은 overlapping patch로 거부되므로 부분 결과는 저장되지 않습니다.

## 실제 검증

SHA-256가 고정된 9,876바이트 실제 Contents를 내부 CFB v4에 넣고, 이를 유효한 압축 DocInfo와 raw-DEFLATE OLE BinData를 가진 바깥 HWP CFB v3에 연결합니다. typed API로 primary axis 0의 title Font 이름과 series 0의 main-label 본문을 각각 수정한 뒤 최종 HWP·BinData 압축·내부 OLE·Contents를 모두 다시 열어 새 최저 object ID, UTF-8 bytes, trailer, 양쪽 CFB version과 내부·외부 형제 stream 보존을 확인합니다.

axis 범위 밖, 원본 Contents 한도, 편집 Contents 한도와 잘못 선택한 size-prefix envelope는 typed API 경계에서 정확한 오류로 거부합니다. 실제 fixture의 초기 BinData도 FileHeader 기본 압축 정책과 일치하는 raw DEFLATE로 저장해 합성 전제 불일치를 허용하지 않습니다.

적대적 검증은 축 index 이동, BinData 순번 이동, `/Contents` 대신 형제 stream 선택, 기존 Font ID 재사용, 편집 전 Contents 저장의 다섯 결함을 각각 주입했습니다. `Debug`, `ReleaseSafe`, `ReleaseFast`의 총 15회에서 모두 실제 파일 round-trip 검사가 결함을 검출했으며, 컴파일 실패는 통과로 세지 않았습니다.

series label 확장 뒤에는 공개 wrapper를 axis 대상으로 오배선, series index 이동, 기존 String ID 재사용, point label 본문으로 오선택, 편집 전 Contents 저장의 다섯 결함을 별도로 주입했습니다. 세 최적화 모드의 15회가 모두 컴파일된 테스트 실패로 검출되었습니다.

동일 차트 배치에는 wire 순서 대신 명령 순서로 ID 배정, 첫 ID 예약 누락, 첫 요청만 writer에 전달, 원본 좌표 patch 정렬 제거, 편집 전 Contents 저장의 다섯 결함을 주입했습니다. `Debug`, `ReleaseSafe`, `ReleaseFast` 15회 모두 컴파일은 성공하고 실제 round-trip 검사가 실패했습니다. 정상 검사는 axis와 series 명령을 wire 역순으로 전달하고 두 새 ID·문자열과 내외부 형제 stream을 함께 확인합니다. writer 배치는 빈 요청·새 ID 중복·대상 중복을 별도로 거부하며 allocation-failure 전수 검사에 포함됩니다.

## 남은 범위

현재 typed 대상은 observed V6 차트의 primary-axis title Font name alias와 series main-label body alias이며, 같은 차트에서는 두 종류를 원자적 batch로 조합할 수 있습니다. 고정 실제 fixture의 point label 본문은 전부 null 또는 inline이라 기존 alias fork의 성공 근거로 사용할 수 없으며, 해당 typed API를 합성 fixture만으로 노출하지 않습니다. 이미 inline인 문자열, 다른 Font 위치, TextBlock·TextFormat의 다른 위치와 여러 차트/BinData의 typed batch는 별도 wire 계약이나 기존 writer 연결이 필요합니다. chart layout은 opaque wire 값에서 추측하지 않으며 caller가 신뢰할 수 있는 구조 count를 명시해야 합니다. 차트 렌더링·수식 재계산·한글 프로그램과의 시각 동일성은 이 저장 성공으로 증명되지 않습니다.
