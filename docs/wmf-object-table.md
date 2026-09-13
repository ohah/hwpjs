# WMF Object Table 수명 검증

## 명세와 책임

Microsoft [Object Record Types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/aeab62b8-03ab-48c0-8176-09c392f3c9da)는 일곱 생성 종류와 선택·삭제 종류를 열거하고, 생성 객체를 항상 가장 낮은 빈 인덱스에 배정하도록 요구한다. [WMF Object Table](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/ea7c8077-111a-451e-8b99-181705f97cf4)은 인덱스가 0부터 시작하고 삭제 후 반환된 인덱스를 후속 생성이 재사용한다고 설명한다. [META_DELETEOBJECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/2a507b8c-6cbc-449d-b95c-faa3fdb6cc15)과 [META_SELECTOBJECT](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/59b4b6f3-40db-4685-8eda-3be3e4196fb2)은 첫 parameter WORD를 ObjectIndex로 사용한다.

`src/image/wmf/records.zig`의 `Iterator`가 generic record 경계와 borrowed parameter slice의 SSOT다. `src/image/wmf/objects.zig`는 이미 framing 검증된 EOF 범위에서 이 Iterator를 재사용하여 Object Table만 재생한다. `NumberOfObjects`를 실제 슬롯 수로 사용하며 bitset의 WORD 반올림 저장 용량을 슬롯 수로 사용하지 않는다.

생성은 `CREATEPALETTE`, 두 pattern brush, pen, font, brush, region을 모두 분류한다. `SELECTCLIPREGION`, `SELECTOBJECT`, `SELECTPALETTE`와 `DELETEOBJECT`는 정확히 4 WORD여야 하고 범위 안의 live 인덱스만 참조할 수 있다. 삭제된 슬롯은 즉시 비워 다음 생성에서 가장 낮은 빈 인덱스로 재사용한다. 실제 표본의 [pen·brush·font payload](wmf-create-payloads.md)는 후속 parser가 소유한다. 나머지 객체 payload, 객체 종류별 선택 적합성, 선택된 객체 삭제의 playback 의미, 그리기 결과는 이 단계의 책임이 아니다.

## 실제 HWP 근거

hash-pinned `reference/rhwp/samples/issue5724/2689441_wmf_contents_ole.hwp`의 `/BinData/BIN0001.OLE/CONTENTS`에는 생성 197개, 선택 680개, 삭제 192개가 있다. 가장 높은 동시 live 수와 사용한 슬롯 수는 모두 9로 META_HEADER `NumberOfObjects=9`와 일치한다. 모든 선택·삭제 인덱스는 당시 live 상태였고 마지막에는 5개가 남는다.

실표본 수치는 독립 Node 순회와 Zig 공개 API 결과를 정확히 대조한다. 합성 검증은 두 슬롯 생성, index 1 선택, index 0 삭제, 새 생성의 index 0 재사용과 dead 선택·dead 삭제·테이블 초과를 구분한다. framing 성공을 객체 payload나 렌더링 완료로 세지 않는다.

적대적 검증은 (1) pen 생성 분류 제거, (2) 최저 슬롯 대신 높은 슬롯부터 배정, (3) dead 선택 허용, (4) 삭제 후 슬롯 미반환, (5) 선언 슬롯 수를 bitset WORD 경계로 반올림하는 다섯 변이를 주입했다. Debug·ReleaseSafe·ReleaseFast의 유효 15회 모두 실제 표본 또는 공개 API 합성 계약이 검출했고 각 변이는 원복했다. 이 과정에서 bitset `capacity()`를 명세 슬롯 수로 오인하는 실제 초기 결함과, record용 synthetic helper 인자를 객체 슬롯으로 오해한 테스트 결함도 수정했다.
