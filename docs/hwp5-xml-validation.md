# HWP5 내부 XML 검증 연결

## 선택과 지원 경계

컨테이너 `Options.xml`을 선택하면 이미 선택된 XMLTemplate·DocHistory의 XML payload를 공통 XML 검사기로 검증합니다. 기본값 null은 기존 envelope/레코드 검사만 수행합니다. XML 옵션만 켠다고 저장 방식이 자동 선택되거나 미선택 스트림이 소비되지는 않습니다.

```zig
.xml = .{}, // 기본 namespace 검사 포함
.xml_template = .{ .encoding = .decoded },
.history = .{
    .encoding = .observed_hwp_compressed,
    .item = .{ .start_layout = .observed_option_first },
    .last_document = .observed_record,
},
```

위 codec·start layout은 호출자가 알고 선택하는 값입니다. 모든 파일에 같은 저장 방식을 가정하는 사용법이 아닙니다. [XMLTemplate](hwp5-xml-template.md)과 [이력 컨테이너](hwp5-history-container.md)의 기존 선택 계약을 유지합니다.

명세 근거는 HWP5 3.2.10 표 10~12, 3.2.11, 4.4.2 표 158~161입니다. `_SchemaName`은 이름 문자열, 작성자·설명은 일반 WCHAR 메타데이터입니다. Schema·Instance, DIFFDATA(0x30), LASTDOCDATA(0x31)만 XML 대상으로 선택합니다. VersionLog 내부 LASTDOCDATA와 별도 HistoryLastDoc 모두 포함하되 후자는 기존 observed_record 선택이 있어야 검사합니다.

**XML 구조/namespace 검사 성공은 HWPML·DiffML·XSD 의미 검증 성공이 아닙니다.** 루트 이름이나 필드·스키마-인스턴스 관계·이력 적용 순서를 판정하지 않습니다. DTD·일반 엔터티는 공통 XML 검사기의 명시적 오류 정책을 유지합니다. 빈 XML payload는 길이 0의 정상 envelope일 수 있어도 선택적 XML 검사에서는 MissingXmlRoot입니다.

## 책임과 소유권

- `src/hwp5/xml_validation.zig`: WCHAR 입력 정책, 여러 XML 문서의 공통 예산 및 scalar 합계 보고서.
- `history/xml.zig`: 먼저 Item.parse에 성공한 항목을 기존 record.Iterator로 순회하여 XML 태그만 선택합니다. BYTE/UINT 레코드 문법을 다시 구현하지 않습니다.
- `container/xml_template.zig`: 기존 길이 envelope가 가리키는 Schema·Instance 부분만 전달합니다. prefix와 보존 extra는 XML 입력이 아닙니다.
- `container/history.zig`: 디코딩과 레코드 구조 확인 후 같은 decoded 버퍼의 XML 부분을 전달합니다. 작성자·설명·미지 레코드를 XML로 해석하지 않습니다.
- `container/validation.zig`: 하나의 XML 예산을 템플릿과 이력에 공유하고 반환 보고서에 복사합니다.

기존 독립 envelope/Item/View 파서는 원시 WCHAR를 보존하는 계약을 바꾸지 않았습니다. 기존 하위 컨테이너 `inspect`도 XML 검사 없는 동작을 유지하고 `inspectWithXml`의 단일 구현으로 위임합니다. decoded 버퍼는 기존 stream 수명 내에서만 사용하며 최종 XML 보고서는 포인터를 보유하지 않습니다. 할당 실패와 마지막 XML 오류에서도 문서·이력 배열·decoded 버퍼를 정리합니다.

## 인코딩·한도·보고서

WCHAR payload는 UTF-16LE 외부 입력으로 공통 prolog에 전달합니다. UTF-8/UTF-16BE 외부 옵션을 지정하면 InvalidHwpXmlEncoding입니다. UTF-16LE 바이트와 모순되는 XML 인코딩 선언을 무시하거나 실패 후 다른 인코딩으로 재시도하지 않습니다. BOM·선언 처리와 충돌 규칙은 [XML 시작 처리](xml-declaration.md)가 소유합니다. 실제 XMLTemplate 표본은 아직 없어 이 정책이 모든 프로그램의 문자열 저장 관행과 일치한다고 주장하지 않습니다.

기본 max_documents는 4,096입니다. `Options.xml.document`의 입력 바이트·정규화 문자·요소·이벤트·속성·참조 한도는 선택된 모든 XML에 합산 적용합니다. 토큰 크기·깊이·살아 있는 namespace 선언/URI 한도는 각 XML 문서 내부 한도입니다. XML 바이트는 decoded envelope 전체가 아니라 XML payload 바이트만 셉니다. 기존 HWP 전역 decoded 바이트/레코드 예산은 별도로 그대로 적용하며 XML 검사 때문에 이중 차감하지 않습니다.

각 XML 문서가 끝까지 성공한 뒤에만 XML 예산을 차감합니다. 실패한 문서의 부분 통계를 성공 합계로 반환하지 않습니다. 컨테이너가 오류로 끝나면 앞서 성공한 일부 XML을 전체 검사 성공으로 반환하지 않습니다.

`Report.xml`은 미선택이면 null, 선택했지만 대상이 없으면 documents=0입니다. documents와 schema/instance/diff/last_document 개수, XML scalar 합계를 보고합니다. 최대 깊이는 합이 아니라 최댓값입니다. namespace 플래그는 선택한 검사 정책을 나타내므로 documents=0인 보고서로 파일 전체 namespace 검증을 주장하면 안 됩니다. `uninspected_streams=0` 역시 모든 HWP 의미 필드 검증 완료를 뜻하지 않습니다.

## 적대적 검증과 실표본

네이티브 합성 컨테이너에서 Schema·Instance·DiffML·HistoryLastDoc 네 XML이 바이트 32/문자 16/문서 4 한도를 공유함을 확인합니다. 각각 한 단계 부족한 한도에서 실패하며 `_SchemaName`·작성자·설명의 비 XML 문자열은 XML로 오인하지 않습니다. VersionLog 내부 LASTDOCDATA도 별도 검사합니다. 미선택·마지막 문서만 미선택·전체 XML 옵션 해제·실패 후 예산 불변성·재사용·모든 할당 실패를 확인합니다.

테스트 전용 WASM mode 125는 기존 컨테이너 진입점과 저장 방식 선택 reader를 재사용합니다. 정상/손상 XML을 Schema·Instance·각 VersionLog·HistoryLastDoc 위치에 주입하고 미선택 동작과 실패 후 복구를 비교합니다. DTD·미해결 엔터티·잘린 태그·미선언 prefix·후미 NUL·충돌 인코딩 선언·빈 XML, envelope extra를 XML로 읽지 않는 경계를 검사합니다. 앞 문서에 선언된 prefix가 다음 XML 문서로 누출되지 않는 경우도 이 주입에 포함합니다. 테스트 XML 보고서 직렬화는 `xml-report-probe.zig`를 standalone/컨테이너 probe가 공유하며 제품 JS ABI는 변경하지 않습니다.

초기 대조에서 이력 미선택 시 독립 JS 기대값이 부재(undefined)인 마지막 문서 보고서를 소비한 것으로 계산하여 미소비 스트림 수가 1 작았습니다. 제품은 해당 스트림을 올바르게 남겼습니다. 테스트의 null/undefined 판정을 수정했고 이를 제품 파서 결함으로 기록하지 않습니다.

실제 `reference/rhwp/samples/basic/treatise sample.hwp`의 이력 XML 5개, payload 합계 13,291,898바이트를 컨테이너 경로에서 검사합니다. 이력 레코드·메타데이터를 포함한 decoded 13,292,279바이트와 구분합니다. 실제 XMLTemplate 양성 표본은 0개이며 추가한 XMLTemplate은 합성 데이터입니다. 저장 구조·payload 추출·통계 기대값은 기존 Node zlib/CFB/독립 XML oracle과 대조합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 17/17 단계, 네이티브 337/337, HWP5 감사 스크립트 3,082,967 checks를 통과했습니다. XML 컨테이너 전용 결과는 정상 106건·거부 122건입니다. 테스트용 XML 직렬화 공통화 후 Debug 전체 audit도 다시 실행했습니다. Zig 포맷·변경 JS 문법·문서 로컬 링크 36개·diff 공백을 검사했습니다. 검사 건수는 지원률이나 무결함 증명이 아닙니다.

후속 범위 조사에서 기존 HWP fixture 48개를 strict CFB로 읽었고 Bibliography 루트는 0개였습니다. 이는 현재 표본에서의 부재이지 형식의 미존재를 뜻하지 않습니다. Bibliography와 다른 미선택 XML 경로, HWPML/DiffML/XSD 의미·복원·HWPX 통합은 이번 연결의 완료 범위에 포함하지 않습니다.
