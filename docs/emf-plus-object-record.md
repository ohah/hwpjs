# EMF+ Object 레코드와 객체 테이블

## 구현 범위

`src/image/emf/emf_plus_object.zig`는 [MS-EMFPLUS 2.3.5.1](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/978404e2-c994-4e60-bade-cb6ab78e7ffc)의 `EmfPlusObject` envelope와 [ObjectType](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/85484477-90eb-4fb8-bf45-4923e2f49daf)을 해석합니다. Flags의 C, ObjectType, ObjectID를 한곳에서 분리하고 ObjectID 0~63과 유효한 객체 타입 1~9를 검사합니다. `ObjectTypeInvalid`와 정의되지 않은 타입을 객체 정의로 승인하지 않습니다.

`State`는 64슬롯 EMF+ Object Table의 타입과 분할 정의 상태를 보존합니다. 완성된 새 객체가 이미 사용 중인 ID를 가지면 [공식 관리 모델](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/52fff990-7049-4fff-b6c6-3131ac024090)대로 기존 슬롯을 교체합니다. 미완료 객체는 테이블에 등록하지 않습니다. 이는 기존 EMF GDI handle table과 별도 상태입니다.

## 분할 객체

C가 설정된 첫 조각과 같은 ID·타입의 후속 `EmfPlusObject`를 연결합니다. 다른 종류의 EMF+ 레코드는 사이에 올 수 있지만 다음 Object 레코드의 ID·타입은 같아야 합니다. 각 분할 조각의 data 첫 DWORD를 `TotalObjectSize`로 읽고 모든 조각에서 같은 값인지 검사합니다. 마지막 조각은 C가 꺼져 있어야 하며, EOF나 stream 종료 시 아직 부족하면 오류입니다.

공식 표는 `TotalObjectSize`를 선택 필드로 그리고 C가 설정될 때 존재한다고 설명하는 한편, 이어지는 문장은 각 continued-object record가 이 값을 가진다고 명시합니다. 실제 조립 경계가 모호해지지 않도록 분할 열에 들어간 마지막 레코드도 DWORD를 요구합니다. 이는 LibreOffice의 현재 EMF+ reader가 마지막 조각에서도 DWORD를 제외하고 합치는 동작과도 일치합니다. 비분할 객체에는 이 DWORD가 없습니다.

레코드 `DataSize`는 4바이트 정렬되지만 객체의 의미 길이는 그렇지 않을 수 있습니다. 따라서 마지막 조각은 `TotalObjectSize`를 채운 뒤 최대 3바이트의 정렬 패딩을 가질 수 있습니다. 의미 길이 미만, 정렬 길이 초과, 이미 의미 길이를 채운 조각의 C 설정은 각각 거부합니다. 패딩 값은 명세대로 해석하지 않습니다.

`Assembler`는 호출자가 제공한 allocator로 분할 payload의 의미 바이트만 순서대로 복사합니다. 마지막 record의 0~3바이트 정렬 padding은 결과에 포함하지 않으며, 비분할 payload는 입력을 그대로 빌려 불필요한 복사를 하지 않습니다. 기본 객체 한도는 64 MiB이고 `AssembleOptions.max_object_bytes`로 명시적으로 바꿀 수 있습니다. 분할 객체는 첫 record의 `TotalObjectSize`가 한도를 넘는 즉시 거부합니다. 반환된 분할 slice는 assembler가 소유하며 다음 object consume 또는 `reset`·`deinit` 전까지만 유효합니다.

구조 전용 `State`와 소유 `Assembler`는 ID·타입·총량·continuation·padding 판정을 같은 순수 전이 함수에서 공유합니다. Assembler는 객체 table을 갱신하거나 payload 종류를 해석하지 않으므로, 호출자는 완성 payload 검증이 성공한 뒤 table에 반영해야 합니다. 현재 공통 EMF 구조 검사는 할당 없는 `State`를 사용하며 allocator 기반 assembler를 아직 전체 framing에 연결하지 않았습니다.

Brush, Pen, Path, Region, Image, Font, StringFormat, ImageAttributes, CustomLineCap의 필드 해석은 후속 객체별 계층의 책임입니다. 현재 테이블 항목은 타입만 보존하며 렌더링 가능한 객체라고 주장하지 않습니다. 별도 record인 `EmfPlusSerializableObject`와 image effect의 범위는 [전용 문서](emf-plus-serializable-object.md)가 소유합니다.

## 검증 경계

전용 테스트는 타입 1~9, ID 0·63과 범위 밖 ID, 단일 객체, 슬롯 교체, 여러 comment를 건너는 분할 객체, 중간 비객체 레코드, 마지막 조각의 0~3바이트 패딩 계약, 총량 변경·초과·부족, ID/타입 변경, C 불일치, EOF 미완료와 실패 원자성을 검사합니다. 전체 EMF framing은 같은 상태를 사용하므로 comment 단위 실패도 이전 상태를 변경하지 않습니다.

Assembler 테스트는 직접 borrowed 결과, 여러 분할 객체의 버퍼 재사용, 의미 길이 1~32의 모든 4바이트 분할 위치와 마지막 padding 0~3바이트, 선언 크기·실제 누적 크기 한도, 실패 뒤 pending 불변성, 모든 allocation failure 지점과 성공·오류 경로 해제를 검사합니다. ReleaseFast에서도 `DebugAllocator(.{ .safety = true })`로 해제 누락을 명시적으로 탐지합니다.

현재 정규 검증에는 실제 HWP에서 추출한 EMF+ Object 표본이 없습니다. 합성 레코드와 공식 필드 계약의 통과를 한글 생성기별 호환성 또는 렌더링 일치 증거로 확대하지 않습니다.

독립 임시 소스 복사본에서 ID 64 허용, invalid 타입 허용, 마지막 조각의 TotalObjectSize 누락, ID/타입 일치 조건 약화, 조각별 총량 변경 허용, 정렬 패딩 거부, C 종료 조건 두 방향, 신규/교체 분기 반전의 9개 결함을 각각 주입했습니다. 캐시를 공유하지 않은 Debug·ReleaseSafe·ReleaseFast 27회에서 모두 검출했습니다. 최초 검토에서는 후속 조각이 정확히 총량에 도달한 채 C를 유지하는 변이와 신규/교체 분기 반전이 살아남아, 해당 중간 상태 검사를 보강한 뒤 처음부터 다시 실행했습니다. `u32` 최대 의미 길이에 마지막 패딩이 붙어 wire 누적이 `2^32`가 되는 경우도 별도 회귀로 고정했습니다.

Assembler 추가 후에는 선언 한도 검사 제거, 마지막 padding의 payload 혼입, continuation ID 검사 제거, TotalObjectSize 일치 검사 제거, 다음 multipart 시작 시 버퍼 초기화 제거, `deinit` 해제 제거의 6개 결함을 독립 복사본에 각각 주입했습니다. 각 복사본은 별도 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했고 18/18회 모두 실패했습니다. 해제 제거는 세 모드 모두 safety가 켜진 `DebugAllocator`가 직접 검출했습니다. 임시 로그는 `/tmp/hwpjs-emfplus-assembler-mutants.SXfqpt/`에 남겼습니다.

제품 트리의 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 단계, 1,507/1,507 테스트를 통과했습니다. 각 모드는 네이티브 1,468개, 차트 소유권 31개, WMF 8개와 HWP/WASM 8,905,827회 검사, WASM imports 0개를 포함합니다. 로그는 `/tmp/hwpjs-emfplus-object-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 남겼습니다. 이 수치는 위에 명시한 객체 payload·실제 EMF+ 표본 공백을 완료로 바꾸지 않습니다.

Assembler가 포함된 최종 제품 트리의 순차 전체 audit는 Debug·ReleaseSafe·ReleaseFast에서 각각 40/40 단계, 1,524/1,524 테스트를 통과했습니다. 각 모드는 네이티브 1,485개, 차트 소유권 31개, WMF 8개, HWP/WASM 8,905,827회 검사와 WASM imports 0개를 포함합니다. 앞 단락은 객체 table 단계의 이력이며 이 수치가 현재 결과입니다. 실제 EMF+ corpus 표본과 객체별 payload 해석 공백은 그대로 구분합니다.
