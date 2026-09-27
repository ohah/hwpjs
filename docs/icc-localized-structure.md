# ICC 다국어 문자열 원시 구조

v2의 별도 문자열 타입 작업은 [ICC v2 문자열 구조](icc-v2-text.md)에서 관리합니다. 아래 v4 mluc API의 판본 계약을 자동 변경하지 않습니다.

## 계약

[ICC.1:2022 §10.15 Table 54](https://www.color.org/specifications/ICC.1-2022-05.pdf)에 따라 mluc의 개수·레코드 크기·언어/국가 코드 원형·문자열 길이/오프셋을 읽습니다. mluc.zig는 경계와 빌린 View를 소유하고 localized_tag.zig는 v4_2022의 desc/cprt 이름과 허용 타입을 연결합니다. 이 v4 전용 `localized_tag.parse`에서 알려지지 않은 이름은 null, 알려진 이름의 v2 요청은 명시적 미지원 오류입니다. 통합 `tag_payload.parse`는 v2 desc/cprt를 별도 [v2 문자열 구조](icc-v2-text.md)로 처리합니다.

레코드 위치는 16+index×stride입니다. stride가 12보다 작으면 거부하며, 더 크면 명세 본문의 확장 지침에 따라 추가 바이트를 보존합니다. 이는 현재 표의 12바이트 배치와 확장 바이트의 의미까지 검증했다는 주장이 아닙니다. localized 결과에 extensions_deferred를 표시합니다.

개수 상한·전체 바이트 상한을 적용하고, 나눗셈으로 테이블 크기를 검사한 뒤 곱셈합니다. 문자열 길이는 바이트 단위이며 짝수여야 합니다. 오프셋은 레코드 테이블 뒤의 저장 영역 안에 있어야 하고 길이는 남은 바이트 이내여야 합니다. 문자열의 공유·겹침은 금지하지 않으며 문자열 오프셋에 임의의 4바이트 정렬 조건을 추가하지 않습니다. 빈 레코드 집합을 원시 구조로 읽을 수 있지만 태그 내용의 충분성을 보증하지 않습니다.

View와 Record.text/extension은 입력을 빌립니다. View는 parse 결과를 그대로 사용하고, 입력·View 메타데이터는 사용하는 동안 변경하지 않아야 합니다. 결과를 얻기 위해 할당하거나 공유 문자열을 복제하지 않습니다. 모든 문자열의 경계를 검사하지만 문자열 내용을 반복 스캔하지 않으므로 원시 파싱 시간은 레코드 수에 비례합니다.

이 원시 `localized_tag` 결과의 unicode_deferred·locale_deferred는 true입니다. 이 계층만으로 고립 surrogate, NUL, BOM, ISO 언어/국가 코드, 중복 locale, 사용자 언어 선택/fallback, desc/cprt의 내용 의미를 검사했다고 보지 않습니다. 원시 바이트를 임의로 정규화하거나 종결자를 제거하지 않습니다. UTF-16 내용 검사는 별도 [Unicode 검사](icc-localized-unicode.md), 기본 원문 선택과 명시적 IANA 비교는 각각 [선택 정책](icc-localized-selection.md)·[IANA 비교](icc-localized-iana-matching.md)가 소유합니다. 선택형 전체 태그 [payload 검사](icc-tag-payload-dispatch.md)는 localized Unicode를 검사하지만, [필수 태그 존재 검사](icc-required-presence.md)의 payloads_deferred·계산 모델 보류는 그대로입니다.

## 검증 진행

2026-09-27 재검증에서 ICC.1:2022 §10.15 Table 54의 stride·원문 저장·공유 문자열 규칙과 현재 `mluc.zig`·`localized_tag.zig`·v2 통합 분기·후속 Unicode/선택 모듈을 대조했습니다. Debug·ReleaseSafe·ReleaseFast의 넓은 root 진입 `mluc` 필터는 각각 10/10(원시 3개·Unicode 2개·선택 4개·root 1개), 별도 `localized tags dispatch` 필터는 각각 2/2(root 포함) 통과했습니다. 기존 로컬 `hwp5-probe.wasm` mode 164/165와 독립 JS `iccMlucEdges`는 정상 148건·거부 138건이 일치했습니다. WASM을 이번에 새로 빌드하지 않았고, 과거 전체 audit·macOS 프로파일 12태그·4,096개 공유 문자열 수동 스트레스는 재실행하지 않았습니다. 결과는 원시 구조·연결 검증이며 모든 locale·Unicode·전체 ICC 의미가 이 계층에서 확정됐다는 뜻이 아닙니다.

### 과거 검증 기록

후속 [Unicode 내용 검증](icc-localized-unicode.md)을 별도 검사기로 구현하고 세 빌드 모드에서 검증했습니다. 이 원시 파서의 바이트 보존·보류 플래그 계약을 자동으로 바꾸지 않습니다.

[문자열 선택](icc-localized-selection.md)은 별도 정책 모듈로 구현하고 세 빌드 모드에서 검증했습니다. 원시 코드 일치에 따른 선택이며 ISO 등록·동의 코드 검증은 아직 완료하지 않았습니다.

최초 mluc 네이티브 테스트가 5/5 단계, 451/451로 통과했습니다. 16바이트 확장 레코드 2개, 같은 문자열 포인터 공유, 언어/국가 원형, 확장 보존, 전 길이 잘림, 오프셋 경계, 작은 stride, 개수·바이트 한도와 빈 집합을 검사했습니다. 이후 desc/cprt 판본 분기·미지원 이름·의미 보류 테스트를 추가한 전체 네이티브 테스트도 5/5 단계, 452/452로 통과했습니다.

신규 네이티브 3개 테스트는 ReleaseSafe·ReleaseFast 직접 실행에서도 통과했습니다.

WASM mode164/165는 v4/v2 정책으로 localized_tag를 호출하고 상태·종류·개수·stride·보류 플래그 및 각 레코드의 locale·문자열 위치/길이·확장 길이를 반환합니다. 반복 공유 문자열을 복제하지 않습니다. 테스트 어댑터에도 출력 크기 한도를 추가해 결과 배열 크기 계산을 나눗셈으로 제한합니다.

최초 Debug WASM 직접 비교 146건·오류 거부 137건이 통과했습니다. 레코드 수 0/1/2/3/17/256, stride 12/13/16/32, 저장 영역 간격 0/1/3, 공유/겹친 문자열, 전 길이 잘림과 예약 필드 각 비트 손상을 검사했습니다. 이후 빈 문자열의 끝 오프셋, 빈 집합의 u32 최대 stride와 출력 한도 회귀 입력을 추가했습니다. 수정본 Debug WASM에서 추가분까지 직접 실행해 비교 148건·오류 거부 138건이 통과했습니다. 전체 감사 완료 수치와는 구분합니다.

macOS 기본 v4 프로파일 6개(ACESCG Linear, DCI(P3) RGB, Display P3, ITU-2020, ITU-709, ROMM RGB)의 desc/cprt 12개 태그·12개 레코드를 최초 Debug WASM과 독립 Node 정수 읽기로 대조해 일치했습니다. 시스템 파일은 읽기 전용으로 사용했고 복제하지 않았습니다. 실파일에서 다중 레코드·확장 stride를 확인했다는 근거는 아니며 Unicode 내용 유효성이나 표시 결과 대조도 아닙니다.

`/tmp/hwpjs-icc-mluc-Debug-first.log`의 최초 전체 감사가 종료 코드 0으로 끝났습니다. 출력 한도 수정·후속 회귀 입력 추가 전에 시작했으므로 최종 수정본 검증과 구분합니다. 수정본 Debug·ReleaseSafe·ReleaseFast 전체 감사는 각각 종료 코드 0, 20/20 단계, 네이티브 452/452, HWP5 검사 4,766,191건으로 통과했습니다. 신규 비교 148건·오류 거부 138건도 세 모드 모두 확인했습니다. 최종 로그는 `/tmp/hwpjs-icc-mluc-{Debug,ReleaseSafe,ReleaseFast}-final.log`입니다. 포맷·JS 문법·diff 공백 검사도 통과했습니다. 검사 수는 지원율이 아니며, 이 문서는 원시 구조 작업 기록이지 다국어 문자열 의미 검증 완료 기록이 아닙니다.

[공식 기술 노트 01-2002](https://www.color.org/unicode/)도 대조했습니다. ISO 639-1 언어 코드와 ISO 3166의 두 글자 지역 코드를 사용한다는 설명이며, 원시 레코드를 읽는 것만으로 그 코드의 등록 유효성을 보증하지 않습니다. locale_deferred를 유지하는 현재 경계를 확인했습니다.

최종 적대적 검토에서 문자열 끝 검사를 덧셈 대신 남은 길이와 비교하는 점, 테이블 크기의 나눗셈 선검사, stride 기반 레코드 접근, 마지막 레코드까지 경계를 검사하는 점과 원시/의미 검증 책임 분리를 확인했습니다. 수정본 Debug WASM에 레코드 4,096개가 같은 1MiB 문자열을 가리키는 입력을 넣어 모든 위치·길이가 유지됨을 대조했습니다. 입력 1,097,752바이트에 논리 참조량은 4,294,967,296바이트지만 출력은 65,556바이트였으며 문자열을 반복 복제하지 않았습니다. 수동 스트레스 검사는 자동 감사 수에 합산하지 않으며 UTF-16 내용 검증의 증거가 아닙니다.
