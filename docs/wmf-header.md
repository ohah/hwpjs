# Placeable WMF 헤더와 HWP OLE 관측 크기

## 책임과 명세

`src/image/wmf/header.zig`는 22바이트 META_PLACEABLE과 바로 뒤 18바이트 META_HEADER를 읽으며, [EMF public comment](emf-public-comments.md)가 제공하는 Placeable 없는 표준 META_HEADER 진입점도 같은 필드 파서를 재사용한다. `src/image/wmf/records.zig`는 두 헤더 형식 뒤의 generic META_RECORD DWORD 크기와 WORD 함수, 최대 record 크기, 종단 META_EOF를 검증한다. Microsoft [MS-WMF META_PLACEABLE](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/828e1864-7fe7-42d8-ab0a-1de161b32f27)의 key `0x9AC6CDD7`, reserved 0, 앞선 10 WORD의 XOR checksum과 disk형 handle 0을 검사한다. bounding box의 signed 좌표, inch, handle과 checksum 원값을 보존하며 좌표 방향이나 inch 1440을 강제하지 않는다.

[MS-WMF META_HEADER](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/d169108a-e3fe-436a-bb44-bea61a46ce56)의 type 1/2, header size 9 WORD, version 0x0100/0x0300을 검사한다. object 수, 최대 record WORD 수와 권고값인 number of members는 원값으로 보존한다. record framing 단계는 선언 최대값과 EOF까지 검증하지만 객체 인덱스·그리기 명령 의미는 아직 검증하지 않는다.

## 크기 정책과 실제 한글 편차

공식 `specified` 정책은 placeable 22바이트를 제외한 META_HEADER부터 파일 끝까지를 `Size` WORD 수와 대조한다. 실제 한글 표본은 이 규칙과 다르므로 길이 실패 후 자동 fallback하지 않는다. 명시적 `observed_payload_words` 정책만 META_HEADER 뒤 record payload 바이트 수와 `Size`를 대조한다.

584개 HWP/52개 직접 OLE 항목 조사에서 내부 대소문자 무시 `Contents`는 44개다. `VtChart` 배치 43개와 별개인 한 개는 `reference/rhwp/samples/issue5724/2689441_wmf_contents_ole.hwp`, `/BinData/BIN0001.OLE`, 내부 대문자 `CONTENTS`다. payload SHA-256은 `b672049cbc647c8e5ca847a2b5d5e7691ac7f3bdf9d562d979a441644f25ce4b`, 길이는 24,746바이트다.

이 파일은 bounds `(0,0,5446,2160)`, inch 576, checksum 18535, memory type, version 0x0300, object 9, max record 460 WORD, members 0이다. 표준 구간은 12,362 WORD지만 저장 `Size`는 header 9 WORD를 제외한 12,353이다. record는 1,886개이며 최대값은 선언과 같은 460 WORD다. META_EOF가 끝난 뒤 정확히 9개의 zero WORD가 남으므로 호출자가 `trailing_zero_words = 9`를 명시해야 한다. 기본값은 0이고 임의 길이나 0이 아닌 trailing data는 허용하지 않는다. 따라서 스트림 이름만으로 차트를 선택하거나 이 편차를 모든 WMF 규칙으로 일반화하지 않는다.

## 검증과 미완료 범위

합성 fixture는 두 크기 정책, signed 좌표, 모든 40바이트 prefix 잘림, key/reserved/checksum/type/header size/version/size, 홀수 전체 길이, disk handle과 advisory members를 검사한다. 실제 fixture는 외부 HWP·BinData·OLE·스트림 이름·digest를 생성 단계에서 고정하고 두 정책의 성공/거부, 모든 반환 필드, 모든 header 잘림과 checksum/size 손상을 검사한다.

적대적 검증은 (1) placeable key 상수 변경, (2) checksum 검증 우회, (3) 관측 크기를 공식 크기로 계산, (4) right 좌표를 top 오프셋에서 읽기, (5) 반환 `Size`를 `MaxRecord`에 연결하는 다섯 변이를 각각 주입했다. Debug·ReleaseSafe·ReleaseFast에서 총 15회 모두 실제 fixture 또는 손상 fixture 검사가 변이를 검출했으며, 각 변이는 검출 직후 원복했다.

record 파트는 (1) 최소 크기를 3에서 2 WORD로 완화, (2) 함수 WORD를 잘못된 오프셋에서 읽기, (3) EOF 뒤 record data 허용, (4) trailing zero 내용 검사 우회, (5) 선언 `MaxRecord` 대조 우회의 다섯 변이를 같은 세 모드에서 주입했다. 최초 최소 크기 변이는 전체 단위 테스트만 잡고 전용 감사가 놓치는 위치 편향을 드러냈다. 공개 API 합성 계약을 전용 감사에도 추가한 뒤 재실행한 유효 15회는 모두 검출됐고 코드는 원복했다.

이 파트는 WMF 헤더와 generic record framing, 한 실제 HWP envelope의 분류 근거다. 후속 [Object Table 수명 검증](wmf-object-table.md)은 생성·선택·삭제 인덱스를 검사한다. 개별 객체 payload와 그리기 record 파라미터, EMF/BMP/수식 `Contents`, `OlePres000`, SVG/픽셀 렌더링과 제품 JS API 연결은 남아 있다. 구조 검증 성공을 안전한 렌더링이나 전체 WMF/HWP 지원으로 세지 않는다.
