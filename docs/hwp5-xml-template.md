# XMLTemplate 문자열과 선택적 컨테이너 검사

[문서 계약](hwp5-document-contracts.md)

## 명세와 구현 범위

HWP5 공식 PDF 3.2.10, 표 10~12는 XMLTemplate storage의 `_SchemaName`, `Schema`, `Instance` stream을 정의합니다. 각 stream의 decoded envelope는 DWORD 코드 유닛 수와 그 수의 WCHAR입니다. NUL 종결·XML 스키마의 유효성·세 stream이 반드시 함께 있어야 하는 규칙을 추가하지 않습니다.

`xml_template/string.zig`는 기존 `utf16_string.read32`로 envelope를 읽고 UTF-16LE 원문과 extra를 빌립니다. `template.zig`는 이미 decoded된 세 optional 입력의 전체 바이트 제한과 borrowed view를 조립합니다. 이 독립 API는 입력 수명을 유지해야 합니다.

`container/xml_template.zig`는 정확한 경로·CFB kind·선택된 codec·전역/지역 바이트 한도와 scalar 보고서를 담당합니다. 문자열 문법이나 XML parser를 복제하지 않습니다. 레거시 Rust는 세 envelope 파서를 별도로 구현하고 파싱 실패를 경고 후 생략하지만, 새 코어는 알려진 손상/할당 실패를 호출자에게 반환합니다. 이 차이를 완전 동일 동작으로 표현하지 않습니다.

## 명시적 선택과 저장 방식

`container_validation.Options.xml_template`은 기본 null입니다. 기본 검사에서는 해당 storage를 해석하거나 소비했다고 표시하지 않습니다. 예를 들어 저장된 바이트가 decoded envelope임을 알고 있는 호출자는 다음과 같이 선택합니다.

```zig
.xml_template = .{
    .encoding = .decoded,
    .max_decoded_bytes = 64 * 1024 * 1024,
},
```

encoding에는 기본값이 없습니다. `decoded`와 `observed_hwp_compressed`를 선택할 수 있습니다. 후자는 다른 HWP stream에서 관측된 raw DEFLATE 및 선택적 CRC32/ISIZE 꼬리 모델이며 **XMLTemplate 실표본에서 확인된 저장 방식이라는 뜻은 아닙니다**. 아직 실제 XMLTemplate 표본이 없으므로 FileHeader.compressed 또는 XMLTemplate 존재 비트만으로 codec을 자동 선택하지 않습니다.

`container/selected_encoding.zig`는 DocHistory와 공유하는 명시적 codec 선택 및 owned buffer 반환 경계입니다. 압축 검사는 기존 `compressed_stream.decode`가 소유하며 실패 후 raw fallback·복호화·다른 codec 재시도는 없습니다. 일반 문서의 기존 보안 거부 정책도 유지합니다.

## 경로·부재·보고서

선택 시 정확한 루트 XMLTemplate은 storage, 세 알려진 직접 자식은 stream이어야 합니다. CFB의 대소문자 동등 비교를 그대로 사용합니다. 다른 루트/중첩의 동명 stream이나 SchemaExtra 같은 별도 이름은 미소비로 남습니다.

Report는 declared(FileHeader 비트)와 present(storage 존재)를 별도로 기록합니다. 각 문자열의 코드 유닛 수는 optional이므로 누락(null)과 빈 문자열(0)을 구별합니다. 선택했지만 storage가 없으면 present=false인 보고서, 아예 선택하지 않으면 null 보고서입니다. 선언 불일치를 자동 수정하거나 필수 누락 오류로 승격하지 않습니다.

decoded_bytes는 선택된 세 stream 전체의 decoded 길이이며 길이 prefix와 extra도 포함합니다. trailing_bytes는 extra 합계입니다. 이 수치는 XML 문법·UTF-16 scalar 유효성·스키마/인스턴스 관계의 검증 성공이 아닙니다. DOCTYPE·외부 엔터티·잘못된 XML·고립 서로게이트·NUL도 원시 코드 유닛으로 읽을 뿐 실행/해석/정규화하지 않습니다.

## 한도와 소유권

지역 max_decoded_bytes는 기본 64 MiB이며 세 stream이 공유합니다. 각 디코딩에는 지역 및 문서 전체 max_total_bytes의 남은 값 중 작은 한도를 전달합니다. 정확한 한도는 허용하고 한 바이트 부족하면 LimitExceeded입니다. 다음 stream에서 예산을 초기화하지 않습니다. XML envelope는 HWP 데이터 레코드가 아니므로 max_total_records를 차감하지 않습니다.

각 decoded 버퍼는 그 stream 검사 뒤 해제하며 Report는 scalar만 보유합니다. 입력 CFB나 decoded 문자열을 가리키는 포인터를 반환하지 않습니다. 성공한 stream만 used로 표시합니다. 중간 실패 시 내부 used/remaining 문맥은 부분 진행될 수 있지만 전체 container 호출이 이를 버리고 보고서를 반환하지 않습니다. DocHistory 검사 전에 XMLTemplate을 검사하므로 이후 이력도 동일한 전역 바이트 예산의 나머지를 사용합니다.

## 검증 구성과 적대적 검토

테스트 mode 115는 mode u8(0=미선택, 1=decoded, 2=관측 압축 모델), 지역 바이트 한도 u32, 기존 컨테이너 입력을 받습니다. 기존 보고서 뒤에 선택 여부를 붙이고 선택된 경우 present/declared/decoded_bytes/trailing_bytes와 세 문자열의 존재/유닛 수 쌍을 직렬화합니다. 기존 mode 25와 제품 JS API는 변경하지 않습니다.

SSOT 재검토에서 기존/신규 테스트의 컨테이너 끝 두 필드 위치가 반복된 것을 확인해 `container-report-wire.mjs`로 모았습니다. DocHistory·XMLTemplate 기대값과 ViewText·곡선 실파일 예산 검사에서 공유합니다. 이 모듈은 일반 보고서의 바이트 위치만 소유하며 압축/문자열 해석 결과를 제품 코드에서 가져오지 않습니다.

독립 JS 기대값은 Node zlib와 DWORD/WCHAR 길이 계산으로 구성합니다. 성공 40·거부 117개의 집중 검사는 다음을 포함합니다.

- 두 codec, 선언 비트 두 값, stream 부재 조합 8개. 세 필드에 서로 다른 길이/꼬리를 넣어 위치와 필드 대응을 대조합니다.
- 선언만 있는 storage 부재와 storage만 있는 경우, 빈 문자열/잘린 envelope의 구분, 세 stream마다 모든 짧은 prefix 및 0x7fffffff/0x80000000/0xffffffff 길이 거부.
- 65,536유닛 입력과 홀수 extra, 지역/문서 전체 바이트 한도의 정확한 경계와 한 바이트 부족.
- storage/stream kind 오류, 대소문자·중첩·루트 동명·미지 이름, 잘못된 codec·잘린 decoded payload·CRC 오류·부가 압축 꼬리.
- XML 선언/엔터티를 외부 조회하지 않는 원문 검사, 거부 후 정상 입력 복구, 입력 CFB 바이트 불변성, 미선택 결과와 기존 mode 25 비교.

네이티브에서는 물리 순서 Instance/_SchemaName/Schema와 의미 필드 순서가 다른 fixture를 사용합니다. 정상 경로, 마지막 XML stream의 지역 한도 실패, XML 성공 후 이력의 전역 한도 실패 각각에 모든 할당 실패를 주입합니다. XML 18바이트와 이력 16바이트가 같은 전역 예산을 공유하며, 미선택 시 XML 3개 stream이 미소비로 남습니다.

실제 `treatise sample.hwp`는 XMLTemplate이 없는 컨테이너 기반으로만 사용하고, 추가 stream은 메모리에서 합성합니다. 원본 파일을 수정하지 않습니다. 실제 XMLTemplate 표본 검증 수는 0이며, 합성 성공을 실제 작성 프로그램/모든 버전 호환성으로 확대하지 않습니다.

현재 `rg --files --iglob '*.hwp' reference legacy`의 789경로를 제품 CFB reader의 strict 모드로 다시 조사했습니다. 읽기 성공 599개에서 정확한 `/XMLTemplate`은 0개였고, `/FileHeader`의 bit 5가 켜진 경우는 7개였습니다. 읽기 실패 190개는 storage 부재로 판정하지 않습니다. 경로 수는 고유 파일 수가 아니며, 비트 선언과 실제 storage를 별도로 보고해야 한다는 근거입니다. 최초 전체 파일 목록 수집은 Node 자식 프로세스 출력 한도를 초과했으므로 HWP 확장자를 rg 단계에서 제한해 다시 실행한 최종 결과만 기록했습니다.

## 최종 실행 결과

테스트 위치 SSOT 수정 이후 Debug → ReleaseSafe → ReleaseFast의 전체 audit를 다시 순차 실행했습니다. 세 모드 모두 16/16 빌드 단계, 네이티브 300/300, Node 47/47 및 22/22, HWP5 WASM 검사 1,629,128건을 통과했습니다. XMLTemplate 집중 결과는 각 모드 정상 40·거부 117이며, 검사 건수는 지원 필드/파일 수가 아닙니다.

최종 로그는 `/tmp/hwpjs-xml-container-final-debug.log`, `/tmp/hwpjs-xml-container-final-safe.log`, `/tmp/hwpjs-xml-container-final-fast.log`입니다. 수정 전의 실행 로그와 구분하며, 재현 명령은 [개발·검증 명령](development-commands.md)의 세 모드 audit입니다. ReleaseSafe/Fast의 실제 audit probe로 집중 검사도 별도 재실행했습니다.

공통 테스트 보고서 helper는 별도의 고정 바이트 입력에서 totals 읽기·소비량 갱신·원본 불변성을 수동 대조했습니다. 이 수동 검사는 위 자동 audit 건수에 포함하지 않습니다. 변경 Zig 포맷, JS 구문, 문서 로컬 링크 및 git diff 공백 검사도 통과했습니다. 실제 표본/의미 검증의 한계는 아래와 같으며 전체 문서 검증 완료로 표현하지 않습니다.

## 남은 범위

실제 한글 생성 표본에서 codec/필수 stream/버전별 배치 확인, XML 문법과 스키마 검증, 인스턴스 연결·편집/저장·외부 참조 정책이 남아 있습니다. 이번 연결은 XMLTemplate 전체 의미 검증 완료가 아닙니다.
