# PNG 비압축 텍스트 검증

## 계약과 책임

[PNG Third Edition §11.3.3.1~2](https://www.w3.org/TR/png-3/#11textinfo)를 기준으로 비압축 tEXt payload를 읽습니다. `keyword.zig`는 1..79바이트, printable Latin-1(0x20..0x7E, 0xA1..0xFF), 앞뒤·연속 공백 금지 규칙을 소유합니다. NUL 구분자 탐색은 최대 80바이트이며 잘못된 키워드 때문에 전체 대용량 payload를 탐색하지 않습니다. 키워드 대소문자·공백을 정규화하지 않고 등록된 이름만 허용하는 whitelist도 만들지 않습니다.

`text.zig`는 키워드/NUL/본문을 분리하고 본문 문자를 검사합니다. §11.3.3.1이 정의한 printable Latin-1와 LF에 맞춰 0x0A, 0x20..0x7E, 0xA0..0xFF를 허용합니다. NUL은 오류이며 그 외 제어 바이트는 의미가 정의된 tEXt 내용으로 취급하지 않고 UnsupportedPngTextCharacter를 반환합니다. 이는 모든 바이트를 통과시키는 관대한 리더와 구분되는 검증 계약입니다. NBSP(0xA0)는 키워드에서 금지되지만 본문에서는 허용됩니다. 빈 본문은 유효하며 끝에 NUL을 요구하지 않습니다.

Zig의 `image.png_text.parse`는 입력을 빌리는 keyword/text 슬라이스를 반환합니다. 입력 수명은 호출자가 유지하며 별도 할당·문자 변환·줄바꿈 정규화는 없습니다. UTF-8처럼 디코딩하지 않으며 `Creation Time` 등의 키워드별 내용 의미나 XMP/XML 스키마까지 검사하지 않습니다.

`metadata.State`는 tEXt를 반복 허용하고 각 청크를 따로 집계합니다. 같은 키워드도 덮어쓰거나 합치지 않습니다. 성공한 청크/키워드/본문 바이트 수만 갱신하며 실패는 상태를 바꾸지 않습니다. 추가 순서 제한은 없지만 [기존 필수 청크 순서](https://www.w3.org/TR/png-3/#5ChunkOrdering)(IHDR 처음·IEND 끝·IDAT 연속)는 유지합니다.

`pixels.Report`의 text_chunks/text_keyword_bytes/text_bytes는 검증한 tEXt 통계이며 원문 목록을 소유하는 문서 모델은 아닙니다. 원문은 청크 순회와 png_text.parse로 읽습니다. 입력·청크·개수 제한은 기존 structure/chunks가 소유하고, tEXt 본문에는 `pixels.Options.max_text_bytes`가 zTXt·iTXt 본문과 합산되어 적용됩니다. 별도의 무제한 문자열 복사를 하지 않습니다. 검증한 tEXt만 ancillary deferred에서 제외합니다.

[압축 텍스트 zTXt](png-compressed-text.md)와 [국제 텍스트 iTXt](png-international-text.md)는 별도 해제 모듈과 전용 통계로 연결했습니다. 세 종류의 본문 합계 한도는 iTXt 문서가 소유합니다. 텍스트 표시·편집·저장, 제품 JS 텍스트 API는 아직 미구현입니다. zTXt/iTXt를 tEXt 통계에 넣거나 단순 청크 CRC 성공으로 의미 검증 완료라고 보고하지 않습니다.

## 적대적 검증

### 현재 재검증 (2026-09-27)

[PNG Third Edition §11.3.3.1~2](https://www.w3.org/TR/png-3/)의 키워드 1..79바이트·Latin-1·NUL 구분자·빈 본문·반복 허용과 현재 `keyword.zig`·`text.zig`·`metadata.zig`·`pixels.zig`를 대조했습니다. 본문 제어 문자의 의미가 미정인 경우 현재 코드는 검증 정책상 오류로 돌려주며, 다른 관대한 디코더와 수용 집합이 같다고 주장하지 않습니다. 현재는 zTXt/iTXt도 별도 경로에서 검사하므로 과거의 '미구현 텍스트 청크' 표현은 적용하지 않습니다.

Debug·ReleaseSafe·ReleaseFast의 `PNG text` 집중 필터는 각각 root 포함 5/5 통과했습니다. 로컬 probe와 독립 JS oracle은 정상 1,274건·거부 1,768건을 대조했습니다. 추적 HWP PrvImage PNG 32개에서 tEXt는 0개였으므로 양성 실파일 검증으로 세지 않습니다. 아래 전체 audit·79×256 수동 변이 결과는 과거 기록이며 이번에 재실행한 수치가 아닙니다.

### 과거 검증 기록

네이티브는 키워드 첫/중간/끝 위치의 전체 바이트 값, 길이 0..80, 구분자 경계, 본문 전체 바이트 값, 빌린 슬라이스 위치와 원문, 빈 본문, 반복 키워드·오류 상태 불변·모든 할당 실패 정리를 검사합니다.

테스트 전용 WASM mode 135는 전체 PNG와 입력 한도를 받아 5개 u32 LE(청크/키워드 바이트/본문 바이트/deferred 청크/deferred 바이트)를 반환합니다. 이어서 각 tEXt의 키워드 길이·본문 길이(u32 LE 각각)와 원문 바이트를 입력 순서대로 붙입니다. 이 형식은 제품 JS ABI가 아닙니다.

독립 JS는 Buffer 구분자 탐색·문자 범위·공백 검사로 기대값을 만들고 원문 목록도 바이트 단위로 대조합니다. 1,024개 반복 청크, 65,536바이트 본문, 세 바이트 문자열의 모든 문자 위치와 키워드 길이 0..81, 메타데이터 사이 삽입 위치, unknown ancillary 및 잘못된 iTXt 거부, 잘림·CRC·순서·입력 한도를 검사합니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit를 순차 실행해 각각 17/17 단계, 네이티브 369/369, 감사 스크립트 3,187,375 checks를 통과했습니다. 전용 결과는 정상 1,274건·거부 1,767건(정상 입력의 한도 미달 거부 포함)입니다. 실제 PNG 32개에는 tEXt가 없어 양성 텍스트 검증은 합성 입력에 한정합니다.

추가 수동 적대적 검사에서는 최대 길이 키워드 79개 위치 각각에 바이트 0..255를 넣은 20,224가지 입력을 Debug WASM으로 실행했습니다. 허용 15,008건·거부 5,216건이 독립 기대값과 일치했고 허용한 키워드 원문도 일치했습니다. 이 추가 검사는 정규 audit 횟수에 포함하지 않습니다. 포맷·변경 JS 문법·관련 로컬 문서 링크 29개·diff 공백 검사도 통과했습니다.
