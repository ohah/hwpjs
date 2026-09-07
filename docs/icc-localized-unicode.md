# ICC 문자열 Unicode 내용 검증

## 공통 규칙과 책임

[Unicode §3.9.2 D91](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/)의 UTF-16 규칙을 공통 text/scalars.zig에서 해석합니다. 기존 xml/scalars.zig의 구현을 이동하고 XML 어댑터는 InvalidUnicodeEncoding을 기존 InvalidXmlEncoding으로 변환합니다. Encoding·Scalar 타입의 별칭, UnexpectedEnd와 원본 바이트 범위를 유지합니다. XML 문자 허용 규칙과 줄바꿈 정규화는 XML 계층에 남습니다.

text/utf16.zig는 명시한 바이트 순서로 전체 바이트를 읽고 scalar·NUL·U+FEFF 개수와 마지막 NUL 여부를 반환합니다. 고립 surrogate·잘못된 쌍·잘림은 오류입니다. NUL·BOM·비문자·미할당 코드 포인트를 잘못된 UTF-16으로 취급하지 않으며 BOM 제거·종결자 제거·대체 문자·정규화를 하지 않습니다. 문자 해석 가능성과 ICC의 내용 권고 준수는 별개입니다.

mluc_unicode.inspect는 원시 파싱된 View를 UTF-16BE로 검사합니다. 정확히 같은 (offset,length) 범위는 한 번만 읽고 결과를 공유합니다. 부분적으로 겹친 범위는 각각 검사하므로 큰 정상 문자열 내부에 있는 고립 surrogate 조각을 정상으로 승격하지 않습니다. 원시 View와 입력의 수명·불변 계약은 유지합니다.

최대 레코드 수와 고유 범위별 스캔 바이트 합계에 한도를 적용합니다. 부분 겹침은 각각의 길이를 합산합니다. 해시맵은 할당자를 받아 사용하고 성공·잘림·손상·할당 실패에서 해제합니다. 반환 보고서는 포인터를 보유하지 않습니다. inspected_bytes와 unique_strings는 고유 범위 기준, scalar/NUL/BOM 수와 NUL 종결 레코드 수는 레코드별 합계입니다. 원시 View의 u32 개수·길이 한도에서 누적 scalar 개수는 u64 범위 이내입니다.

원시 localized_tag 결과를 변경하거나 locale_deferred를 해제하지 않습니다. NUL 종결은 진단 수치로 남기며 임의로 문자열을 잘라내지 않습니다. ISO 코드 등록 검증·동의 코드·중복 locale·언어 선택/fallback과 태그 내용 의미 검증은 계속 남아 있습니다.

## 검증 진행

2026-09-08 최초 테스트에서 존재하지 않는 std.unicode.utf16Encode 호출을 발견해 Zig 0.16의 UTF-8 인코딩→UTF-16LE 변환 API로 수정했습니다. 이후 전체 Debug 네이티브 테스트가 5/5 단계, 456/456으로 통과했습니다. 두 byte order의 단일 코드 단위 65,536개 전체와 보조 평면 scalar 1,048,576개 전체를 검증합니다. 보조 평면 기대값은 제품 디코더와 별도의 표준 라이브러리 인코딩 경로로 구성합니다.

ICC 테스트는 정확 범위 중복 제거·레코드별 통계·고유 바이트 한도·레코드 한도·부분 겹침의 고립 surrogate를 검사합니다. 할당 실패 주입과 손상 입력 뒤 캐시 해제도 testing allocator로 확인합니다. 기존 XML 테스트도 공통 코드 추출 후 Debug 전체 테스트에 포함되어 통과했습니다.

ReleaseSafe·ReleaseFast 전체 네이티브 검사도 각각 5/5 단계, 456/456으로 통과했습니다. 로그는 `/tmp/hwpjs-icc-unicode-native-{ReleaseSafe,ReleaseFast}.log`입니다.

WASM mode166을 정규 감사에 연결했습니다. Node TextDecoder(utf-16be, fatal=true, ignoreBOM=true)를 독립 기준으로 사용해 BOM을 제거하지 않고 scalar/NUL/BOM 통계를 대조합니다. 새 Debug WASM 직접 실행에서 정상 비교 67,604건·오류 거부 2,096건이 통과했습니다. 단일 코드 단위 전체·surrogate 쌍의 양 끝 경계·비문자·고립 surrogate·공유/부분 겹침·고유 스캔 한도·레코드 한도·잘림·실패 후 복구를 검사합니다.

macOS 기본 프로파일 6개(ACESCG Linear, DCI(P3) RGB, Display P3, ITU-2020, ITU-709, ROMM RGB)의 desc/cprt 12개 태그 내용과 통계가 독립 디코더와 일치했습니다. 총 scalar는 309개, NUL/BOM은 각각 0개였습니다. 시스템 파일은 읽기 전용으로 사용했고 복제하지 않았습니다. 이 결과를 다른 프로파일 전체·언어 코드 유효성·표시 결과로 확대하지 않습니다.

수동 적대적 검증으로 레코드 8,193개가 같은 1MiB의 NUL 문자열을 공유하는 입력을 검사했습니다. 검사 바이트 한도를 1MiB로 설정해 고유 범위 한 개만 스캔함을 확인했고, 레코드별 scalar/NUL 합계 4,295,491,584(u32 최대 초과)도 정확히 반환했습니다. NUL 종결 레코드는 8,193개로 보존되었습니다. 수동 대조와 스트레스 결과는 정규 감사 수에 합산하지 않습니다.

Debug 전체 감사는 `/tmp/hwpjs-icc-unicode-Debug-first.log`에서 20/20 단계·456/456 네이티브 테스트·WASM 감사 4,835,891개 검사 통과를 확인했습니다. 로그 이름의 first는 파일명일 뿐이며, 해당 실행 시작 뒤 제품 코드와 테스트는 변경하지 않았습니다. ReleaseSafe·ReleaseFast 전체 감사도 순차 실행해 종료 코드 0, 각각 20/20 단계·456/456 네이티브 테스트·WASM 감사 4,835,891개 검사로 통과했습니다. 두 로그는 `/tmp/hwpjs-icc-unicode-{ReleaseSafe,ReleaseFast}-final.log`이며 신규 정상 비교 67,604건·오류 거부 2,096건도 세 모드 모두 일치합니다.

최종 코드 재검토에서 XML 어댑터의 기존 오류 이름·원본 위치 유지, 정확 범위와 부분 겹침의 구분, 한도 차감 전 경계 검사, 실패 시 해시맵 해제, u64 레코드 합계와 포인터 없는 반환 보고서를 확인했습니다. View는 mluc.parse의 결과이고 사용 중 원본/메타데이터가 불변이어야 한다는 계약을 전제로 합니다. 임의로 구성한 View의 안전성을 보증하지 않습니다. Zig 포맷·변경 JS 구문·git diff 공백 검사도 통과했습니다. 이번 UTF-16 검사 범위에서 추가 결함은 발견하지 못했으며 언어 코드와 언어 선택 정책은 여전히 미완료입니다.

ReleaseSafe WASM에 저장 영역 앞 1/3/5바이트 간격을 둔 빈 문자열·NUL·BOM/보조 평면/비문자 조합 9건과 서로 다른 오프셋의 길이 0 문자열 1건을 추가로 직접 실행했습니다. 총 10건 모두 TextDecoder 기반 독립 보고서와 일치해 홀수 바이트 시작 위치를 잘못 거부하거나 빈 범위를 하나로 합치지 않음을 확인했습니다. 이는 수동 추가 검증이며 정규 감사 수에는 포함하지 않습니다.
