# HistoryLastDoc의 관측 단일 레코드 검사

[DocHistory 컨테이너](hwp5-history-container.md)

선택적 HWPML XML 구조·namespace 검사 연결은 [내부 XML 검증](hwp5-xml-validation.md)이 소유합니다. 아래 단일 레코드 검사나 이력 복원과 구분합니다.

## 명세와 실제 바이트

HWP5 3.2.11은 DocHistory/HistoryLastDoc을 최종 문서 stream으로 나열하고, 4.4.2.8/표 161은 LASTDOCDATA 태그 0x31의 내용을 HWPML WCHAR로 설명합니다. 별도 HistoryLastDoc의 전체 wire 배치를 이 설명만으로 확정하지 않습니다. 로컬 명세와 공식 PDF에 없는 암호화/복원 규칙을 추가하지 않습니다.

실제 `reference/rhwp/samples/basic/treatise sample.hwp`를 strict CFB로 열고 Node zlib 및 Zig 압축 검사기를 대조했습니다.

- 저장 길이 580,758바이트, raw DEFLATE 소비 길이 580,750바이트, 나머지 8바이트는 `536d11865b2ec900`인 CRC32/ISIZE 꼬리입니다.
- decoded 길이는 13,184,603바이트입니다. 첫 BYTE는 0x31, 다음 DWORD는 13,184,598이며 정확히 `5 + payload 길이`로 stream이 끝납니다.
- payload는 6,592,299개의 UTF-16 코드 유닛입니다. `<HWPML ...>`로 시작하고 `</HWPML>`로 끝나는 텍스트가 관측됩니다. 이 두 문자열이나 바이트 길이로 XML 전체 유효성·현재 본문과의 일치를 판정하지 않습니다.

이 파일에서 별도 최종 문서는 STAG/ETAG로 둘러싼 VersionLog 항목이 아니라 **LASTDOCDATA 레코드 하나**입니다. 모든 버전의 공식 배치 보증이 아니므로 명시적 observed 선택으로만 검사합니다.

## 책임과 선택

`history/last_document.zig`의 `View.parseObserved(decoded, framing)`은 기존 `record.Iterator`와 `value.parse`를 재사용합니다. 한 개의 0x31 레코드와 짝수 payload 길이를 검사하고 원본 전체와 text를 빌립니다. 문자열 끝의 NUL을 제거하거나 BOM·고립 서로게이트·XML entity를 정규화하지 않습니다. 반환 뷰를 사용하는 동안 입력을 유지해야 합니다.

입력이 비어 있으면 MissingHistoryLastDocument, 다른 첫 태그면 InvalidHistoryLastDocumentTag, 추가 완전 레코드면 ExtraHistoryLastDocumentRecord입니다. 잘린 헤더/payload, 홀수 WCHAR 길이, framing 한도 오류는 기존 검사기가 전파합니다. STAG/ETAG 항목 파서를 대신 호출하거나 잘못된 배치에서 fallback하지 않습니다.

컨테이너에서 검사하려면 기존 history 선택에 다음 필드를 추가합니다.

```zig
.history = .{
    .encoding = .observed_hwp_compressed,
    .item = .{ .start_layout = .observed_option_first },
    .last_document = .observed_record,
},
```

last_document의 기본값은 uninspected입니다. 이때 이전처럼 존재/encoded 길이만 보고하고 stream을 미소비로 남깁니다. 선택 시에는 기존 VersionLog 검사 후 같은 encoding으로 디코딩하고 관측 단일 레코드 구조를 검사합니다. 파일에 HistoryLastDoc이 없다고 합성하거나 필수 누락 오류로 승격하지 않습니다.

history.Report.last_document는 선택 후 실제로 검사한 경우에만 records/text_units를 보유합니다. 기존 last_doc_present와 결합해 부재/미검사를 구별합니다. Entry의 Item.Report.last_doc_records(VersionLog 내부의 태그 개수)와 별도 최종 문서 보고서는 서로 다른 위치를 세며 대체하지 않습니다.

## 공유 한도와 소유권

VersionLog와 최종 문서는 history.max_decoded_bytes 및 item.framing.max_records를 공유합니다. max_payload_bytes도 최종 문서 레코드에 적용합니다. max_items는 VersionLog 항목 수의 한도이며 별도 최종 문서를 항목으로 추가하지 않습니다. 문서 전체 바이트/레코드 잔여 한도도 그대로 적용합니다.

실제 표본에서 최종 문서를 선택하면 전체 이력 소비량은 13,292,279바이트/29레코드입니다. VersionLog만 선택했을 때의 107,676바이트/28레코드와 혼동하지 않습니다. 성공한 최종 문서 stream만 uninspected_streams에서 제외하며, **소비는 구조 검사이지 HWPML 의미 검사 완료가 아닙니다**.

decoded 버퍼는 stream 검사 뒤 해제하고 컨테이너에는 scalar만 복사합니다. 마지막 stream에서 실패해도 앞서 만든 이력 배열과 문서 보고서를 정리합니다. 독립 뷰와 달리 컨테이너 보고서는 입력 CFB/decoded 바이트를 빌리지 않습니다.

## 적대적 검증

1. 독립 DWORD/WCHAR 길이 oracle과 실제 decoded 13MB 원문을 대조했습니다. 테스트 mode 116은 보고서 뒤에 원래 레코드 바이트를 붙여 코드 유닛이나 꼬리가 변하지 않았는지 검사합니다.
2. 빈/고립 서로게이트/DOCTYPE·잘못된 XML 텍스트, 0x31을 제외한 BYTE 태그 255개, 모든 짧은 prefix, 홀수 문자열, 추가 완전/잘린 레코드, 큰 DWORD 길이와 payload/레코드 한도를 검사합니다. XML은 실행하거나 외부 조회하지 않습니다.
3. mode 117로 실제 컨테이너의 정확한 전역 바이트 한도와 한 바이트 부족, 실제 payload/이력 레코드 한도를 대조합니다. 작은 대체 최종 문서로 로컬 합계 한도·손상·미선택·전체 history 미선택·누락·decoded codec도 확인하고 실패 후 정상 입력으로 복구합니다.
4. 네이티브 정상/최종 stream 레코드 한도 실패 경로에 모든 할당 실패를 주입합니다. 원본 불변성, VersionLog 6레코드+최종 문서 1레코드와 48+7바이트 예산, 성공 후 미소비 0개를 확인합니다.
5. SSOT는 기존 record/value/selected_encoding과 컨테이너 보고서 위치 helper를 재사용합니다. mode 114/117의 history 선택 prefix도 같은 JS 함수에서 구성합니다. 제품 JS ABI와 기존 mode 114의 기본 출력은 바꾸지 않습니다.

집중 검사는 정상 13·거부 285입니다. 실제 표본은 위 한 파일이며, 다른 버전/프로그램의 저장 방식 검증으로 확대하지 않습니다.

추가 수동 컨테이너 검사에서는 VersionLog를 모두 인식 범위 밖으로 옮긴 뒤 max_items=0을 적용했습니다. 최종 문서만 있는 경우 7바이트/1레코드 한도에서 성공하고, 최종 문서도 없으면 0바이트/0레코드 한도에서 성공했습니다. 이 두 검사는 위 자동 집중 검사 건수에 포함하지 않습니다. 항목 목록의 부재를 최종 문서 부재로 추정하지 않는지 확인한 결과입니다.

전역 레코드 한도도 추가 수동 대조했습니다. Node zlib/레코드 framing으로 DocInfo·BodyText 735레코드를 독립 집계하고, VersionLog 28개와 작은 대체 최종 문서 1개를 더했습니다. 전역 한도 764에서 성공, 763에서 LimitExceeded, 다시 764에서 동일 결과로 복구했습니다. 이 수동 검사 역시 자동 audit 건수와 별도입니다.

## 최종 실행 결과

Debug → ReleaseSafe → ReleaseFast 전체 audit를 순차 실행했습니다. 세 모드 모두 16/16 빌드 단계, 네이티브 302/302, Node 47/47 및 22/22, HWP5 WASM 검사 1,629,453건을 통과했습니다. 각 모드의 historyLastDocumentResults는 정상 13·거부 285 및 위 실파일 수치와 일치합니다. 검사 건수는 지원 필드/파일 수가 아닙니다.

로그는 `/tmp/hwpjs-history-last-document-debug.log`, `/tmp/hwpjs-history-last-document-safe.log`, `/tmp/hwpjs-history-last-document-fast.log`입니다. 재현 명령은 [개발·검증 명령](development-commands.md)의 세 모드 audit입니다. ReleaseSafe/Fast의 실제 audit probe로 집중 검사도 별도 재실행했습니다. Zig 포맷, 변경 JS 구문, 문서 로컬 링크와 git diff 공백 검사도 통과했습니다.

## 남은 범위

표본의 독립 XML 파싱과 DiffML 명령 경계/OLD 값의 관측은 [이력 XML 조사](hwp5-history-xml-evidence.md)에 기록합니다. 외부 조사 결과를 제품 파서의 XML 검증 완료로 보고하지 않습니다.

암호화, 다른 HistoryLastDoc 배치, HWPML XML/스키마 의미, DiffML과의 관계·이력 적용 순서·현재 본문 비교, 복원·편집·저장은 남아 있습니다. 구조 소비 성공이나 `<HWPML>` 문자열로 이력 전체의 재생 가능성을 주장하지 않습니다.
