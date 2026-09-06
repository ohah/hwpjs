# 금칙 문자 관측 배치

[DocInfo 계약](hwp5-docinfo-contracts.md)

## 명세와 관측의 경계

명세 3.2.2 표 4는 FORBIDDEN_CHAR를 가변 길이·레벨 0으로, 4.2 표 13은 태그 94로 나열합니다. 선택한 로컬 명세에는 상세 payload 표가 없습니다. 레거시 Rust는 payload를 raw_data로 보존합니다. 로컬 rhwp `e8800c8de`의 HWPX header 변환 코드는 태그 94·레벨 1·16바이트 0을 생성하지만, 이것만으로 전체 형식을 확정할 수 없습니다.

공식 PDF 사본(`/tmp/hwp5-spec.uK0MG9/spec.pdf`, SHA-256 `1d1da9e6fe22563ae2c5285bbbfc6762974fb7f002278084cbc11e5266bdc782`)의 표 4/13에서도 레벨 0/태그 값을 재확인했습니다. 로컬 요약 문서만 보고 레벨 차이를 판단하지 않았습니다.

실제 표본과 대응 HWPX의 목록 길이를 근거로 **명시적으로 선택하는 관측 뷰**를 구현했습니다. 첫 두 DWORD는 실제 표본에서 항상 0이므로 비어 있지 않은 첫 두 목록의 형식은 실파일로 확인하지 못했습니다. 네 DWORD를 길이로 해석하는 모델의 이 경계를 숨기지 않습니다. 목록 순번별 언어/행두/행말 의미도 확정하지 않습니다.

## 구현 계약

`docinfo/forbidden_chars.zig`의 `Lists.parseObserved(bytes)`는 앞의 u32 네 개를 코드 유닛 수로 읽은 뒤 UTF-16LE 목록 네 개를 순서대로 빌립니다. 각 문자열 바로 앞에 길이가 있는 배치와 다릅니다. 길이 검사는 기존 `utf16_string.readUnits`를 재사용하여 곱셈 전에 남은 바이트 수와 대조합니다. 할당하지 않으며 길이 부족은 `UnexpectedEnd`입니다.

원문·NUL·고립 서로게이트·공백·목록 순서를 보존하고, 마지막 미해석 바이트는 extra로 빌립니다. 홀수 길이 extra도 삭제하지 않습니다. 입력 버퍼는 반환 뷰보다 오래 살아야 합니다. 빈 목록을 기본 금칙 문자나 공백으로 채우지 않습니다.

테스트 mode 95는 이 명시적 뷰를 wasm32에서 호출하며, 목록별 코드 유닛 수/원본 바이트와 extra 길이/바이트를 반환합니다. 태그 dispatch·레벨/소유권·문서 진단·행 나눔은 이 함수의 책임이 아닙니다. 기본 DocInfo reader는 태그 94를 unknown/raw로 유지하며, 문서 조립의 명시적 선택 정책은 아래에서 관리합니다. 이 payload 코어를 전체 금칙 처리 지원으로 세지 않습니다.

## 문서 선택 정책과 보고서

`document.Options.forbidden_chars`의 기본값은 `preserve_raw`입니다. 태그 94의 개수와 레벨 분포를 보고하되 payload 해석은 deferred로 남깁니다. `observed_lists`를 선택하면 기존 parseObserved를 호출하고 길이 부족을 전파합니다. 이 선택에서는 명세 레벨 0/관측 레벨 1을 허용하고 다른 레벨을 `InvalidForbiddenCharLevel`로 거부합니다. 레벨을 변환하거나 관측 부모 17/27만 허용하는 규칙은 만들지 않습니다.

`preserve_raw`는 입력 payload를 해석/변환하지 않는다는 의미입니다. scalar 보고서가 원문 전체를 보관하거나 무손실 재저장을 제공하는 것은 아닙니다. 원문 보관 수명은 호출자/별도 문서 모델의 책임입니다.

`docinfo/forbidden_validation.zig`는 정책·9개 scalar 집계를 소유합니다. document/docinfo는 기존 레코드 순회의 framing을 전달하며 payload나 문자열 길이를 재구현하지 않습니다. 실패 시 집계는 원자적으로 보존합니다. `DocInfo.forbidden_chars`는 records/parsed/deferred, 레벨 0/1/기타 개수, 전체 목록 코드 유닛 수/비어 있지 않은 목록 수/extra 바이트 수입니다. 문서 반환 후 원문을 빌리는 포인터를 남기지 않습니다.

기존 reference 진단의 unknown_records는 감소시키지 않습니다. 관측 배치의 구조 성공이 목록 의미/금칙 행 나눔 검증의 성공은 아닙니다. 기존 문서 wire는 유지하며 테스트 mode 96만 선택 바이트(0 preserve_raw, 1 observed_lists)+기존 decoded 문서 입력을 받아 이 보고서를 반환합니다.

`tests/hwp5/forbidden-document.mjs`는 실제 issue5866 문서의 레코드를 변형해 두 레벨, 빈 레코드부터 15바이트까지 잘림, 레벨 2/1023, 선택값 오류, 부재와 빈 목록/공백 목록 및 extra를 검사합니다. 기본 보존 모드의 통과와 선택 모드의 거부를 구분하고 매번 원본으로 복구합니다. 기존 mode 24 기본 검증도 유지합니다. 네이티브에서는 정책 실패 뒤 집계 불변을 별도로 검사합니다.

## 실제 표본 조사

`reference/rhwp/samples`의 HWP 확장자 파일 536개 중 strict CFB 및 DocInfo 압축 해제를 통과한 것은 430개입니다. 배포용 3개·암호화 1개·기타 컨테이너/서명 오류 102개는 이 payload 조사에 포함하지 않았습니다. 430개 전체 문서 검증이 성공했다는 뜻은 아닙니다.

태그 94는 420개이며 모두 레벨 1입니다. 최근 레벨 0 레코드는 ID_MAPPINGS(17) 300개, DOC_DATA(27) 120개였습니다. 이 관측을 곧바로 유일한 허용 부모 규칙으로 만들지 않습니다.

| Payload | 개수 | 관측 길이 네 개 |
|---|---:|---|
| 16바이트 | 417 | 0, 0, 0, 0 |
| 196바이트 | 1 | 0, 0, 90, 0 |
| 302바이트 | 2 | 0, 0, 92, 51 |

세 비어 있지 않은 표본은 `pr-1674.hwp`, `task1749/saved_bounds_cumulative_page_break.hwp`, `task1749/saved_bounds_cumulative_vpos.hwp`입니다. 대응 HWPX의 forbiddenWordList 네 항목을 base64로 풀어 비교합니다. 비어 있지 않은 목록 5개는 전체 바이트가 같고, HWP의 빈 목록 7개는 HWPX에서 U+0020 한 글자입니다. 이것은 차이를 확인한 결과이지 두 형식이 완전히 같다는 결과가 아닙니다. HWP 원문을 HWPX 표현에 맞춰 변경하지 않습니다.

## 적대적 검증 구성

- 네 목록이 모두 비어 있지 않은 합성 입력으로 헤더/데이터 배치와 각 목록 경계를 검사합니다. 목록별 borrowed 포인터와 extra를 확인합니다.
- 헤더 및 각 목록의 모든 잘림 위치, 네 길이 DWORD의 128개 비트 변형, 최대 u32 길이를 검사합니다. 손상 뒤 원본을 다시 읽어 복구를 확인합니다.
- 네 길이의 0~3 조합 256개, 빈 목록, NUL/고립 서로게이트, 홀수 extra와 extra 절단을 검사합니다. 합성 비어 있지 않은 첫 두 목록은 구현 계약 테스트이며 관측 형식의 실파일 증거가 아닙니다.
- JS 기대값은 원본 DWORD/배열 경계로 독립 계산하며 제품 UTF-16 helper를 호출하지 않습니다. 실제 파일의 420개 레코드도 mode 95와 대조합니다.

## 2026-09-07 검증 결과

Debug/ReleaseSafe/ReleaseFast 전체 audit가 각각 네이티브 252/252, Node 47/47, HWP5 WASM 1,371,775건을 통과했습니다. 금칙 문자 합성 정상·복구 429건/거부 159건, 실제 레코드 420개 및 대응 HWPX 비교를 포함합니다. CFB 변형 12,000건은 trap 0입니다. Zig 포맷·변경 JS 문법·문서 링크·diff 검사도 통과했습니다.

실행 로그는 `/tmp/hwpjs-forbidden-chars-{debug,safe,fast}.log`입니다. 이 결과는 명시적 관측 배치의 경계·보존 검증이며 전체 금칙 처리 의미, 자동 문서 연결 또는 HWPX 제품 파서의 완료 증거가 아닙니다.

### 문서 선택 정책 연결 후 검증

Debug/ReleaseSafe/ReleaseFast audit 모두 네이티브 253/253, Node 47/47, HWP5 WASM 1,371,918건을 통과했습니다. 새 문서 정책 테스트는 정상 5건/거부 35건과 기본 모드·원본 복구 대조를 포함합니다. CFB 변형 12,000건/trap 0, 포맷·JS 문법·diff 검사도 통과했습니다. 로그는 `/tmp/hwpjs-forbidden-document-{debug,safe,fast}.log`입니다. 이 단계는 선택 정책과 집계의 문서 연결을 검증하며 목록의 언어별 의미·행 나눔·무손실 저장은 여전히 범위 밖입니다.

### CFB 파일 입력 대조

제품 container.inspect는 이미 document 옵션을 inspectDecoded에 전달합니다. 빠져 있던 파일 경로 검증을 테스트 mode 97로 보강했습니다. 입력은 선택 바이트+전체 decoded 바이트 한도+CFB 파일이며, 선택값 읽기와 scalar 보고서 직렬화는 mode 96의 helper를 공유합니다. 제품 정책·파서·기존 wire는 변경하지 않았습니다.

기존 DocInfo 변형을 독립 zlib로 압축하고 CFB writer로 새 파일을 만든 뒤, decoded mode 96과 CFB mode 97의 성공 바이트 또는 오류명을 109회 대조합니다. 길이 잘림, 레벨 0/1/2/1023, 원문 보류/관측 해석, 부재·빈 목록·공백 목록·extra, 잘못된 선택값과 매번 원본 복구를 포함합니다. 추가로 재생성하지 않은 원본 CFB도 두 선택값으로 검사합니다. 파일 전체 바이트가 재생성 전후 동일하다는 주장이나 새 금칙 처리 의미 규칙은 아닙니다.

2026-09-07 실측: Debug 전체 audit는 네이티브 253/253, Node 47/47, HWP5 WASM 1,372,027건을 통과했습니다. 실행 도중 추가한 원본 CFB 두 선택 검사는 동일 Debug 산출물의 최종 집중 검사(254개 호출, 109회 경로 대조)로 확인했습니다. 최종 테스트가 포함된 ReleaseSafe/ReleaseFast 전체 audit는 각각 네이티브 253/253, Node 47/47, WASM 1,372,029건을 통과했습니다. 각 전체 audit의 CFB 변형 12,000건은 trap 0입니다.

로그는 `/tmp/hwpjs-forbidden-container-{debug,safe,fast}.log`, 추가 Debug 집중 검사는 `/tmp/hwpjs-forbidden-container-final-debug-focus.log`입니다. 포맷·JS 문법·diff 검사도 통과했습니다. 이 결과는 두 입력 경로의 선택 정책 전파를 입증하며 전체 HWP 문서 지원 완료를 뜻하지 않습니다.
