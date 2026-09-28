# ISO 639와 IANA 이력 차이

## 조사 근거

2026-09-08 [IANA 원본 등록부](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry)를 일반 HTTPS 요청으로 읽어 HTTP 200을 확인했습니다. 전체 바이트 SHA-256은 `be21e91b6851f750a7b1a687f11209d46ad5a8471d6b10a1efc8d1dac4c8a926`로 기존 `src/text/bcp47/data/source.json`의 해시와 일치했습니다. 기존 도구의 records 함수를 사용해 language 레코드 중 LoC 현행 두 글자 목록에 없는 7개의 Deprecated·Preferred-Value·Scope·Comments를 확인했습니다. 원본을 새 파일에 복제하지 않았습니다.

비교 대상은 [LoC 코드 목록](https://www.loc.gov/standards/iso639-2/php/code_list.php)과 [LoC 변경 기록](https://www.loc.gov/standards/iso639-2/php/code_changes.php)입니다. 현행 목록과 과거 이력, ISO와 BCP 47의 등록 상태는 같은 데이터가 아닙니다.

| 코드 | 확인한 LoC 이력 | IANA Deprecated | IANA Preferred-Value |
|---|---|---|---|
| bh | 2021-05-25 폐기, bih 권장 | 2026-06-14 | bih |
| mo | 2008-11-03 폐기, ro 권장 | 2008-11-22 | ro |
| in | 1989-03-11 폐기, id로 변경 | 1989-01-01 | id |
| iw | 1989-03-11 폐기, he로 변경 | 1989-01-01 | he |
| ji | 1989-03-11 폐기, yi로 변경 | 1989-01-01 | yi |
| jw | 2001-08-13 오류 발행 후 폐기, jv로 변경 | 2001-08-13 | jv |
| sh | 2000-02-18 폐기, 단일 대체 코드 없음 | 필드 없음 | 필드 없음 |

jw의 IANA 주석은 ISO 639:1988 Table 1에 잘못 실린 코드라고 설명합니다. sh는 macrolanguage이며 주석에 현대적 사용의 대안으로 sr/hr/bs가 나열돼 있습니다. 이를 단일 preferred 코드로 취급하거나 임의로 sr로 변환하지 않습니다. 이 사실만으로 과거 ISO 문서의 sh 필드가 유효/무효라고 단정하지 않습니다.

2026-09-28 재검증에서 공식 LoC 변경 기록의 in/iw/ji/jw/sh 행도 확인해 위 표에 반영했습니다. 최초 조사 당시 미확정이었던 행을 확인한 것이며, 제품 `src/text/iso639/history.zig`에는 여전히 bh/mo 두 항목만 있습니다. 특히 LoC의 in/iw/ji 폐기일 1989-03-11과 IANA의 1989-01-01은 출처가 다르므로 합치지 않습니다. 현재 IANA 원본은 File-Date 2026-09-17, SHA-256 `755fad43283be7b41ebe3c89ad054b6eaf928f404f9c0edb74799e0eab74beb1`로 위에 적은 과거 고정 원본과 다르지만, 두 글자 language 코드 190개와 LoC 목록의 7개 집합 차이 및 표의 IANA 필드는 다시 대조해 일치했습니다. 고정 데이터나 제품 의미는 이 문서 검증만으로 갱신하지 않습니다.

## 구현에 적용할 경계

- 출처별 폐기 날짜를 섞지 않습니다. `text.iso639`의 확인된 폐기 날짜는 LoC이고, BCP 47 진단을 추가할 때는 IANA 날짜를 별도로 유지해야 합니다.
- 단일 Preferred-Value, 여러 대안을 적은 주석, 같은 언어로 간주하라는 명세 정책을 구분합니다. 주석의 코드를 임의 canonical 값으로 만들지 않습니다.
- bih는 세 글자이므로 두 글자 mluc 필드에 그대로 쓸 수 없습니다. 의미 비교용 키와 원시 저장 코드를 분리해야 하며 자르거나 새 두 글자 코드를 발명하지 않습니다.
- 원시 문자열 선택은 당장 변경하지 않습니다. 역사/동의 코드 비교를 별도 정책으로 조립하고 언어 코드·국가 코드 각각의 출처를 확인한 뒤 locale 검증 보류를 해제해야 합니다.

이번 조사를 바탕으로 [IANA 두 글자 이력 조회](bcp47-alpha2-history.md)를 별도 구현하고 세 모드 전체 감사를 통과했습니다. IANA Preferred-Value의 자동 적용, ISO 전체 과거 이력과 국가 코드 이력, 날짜 기반 호환성 판단은 아직 구현하지 않았습니다.
