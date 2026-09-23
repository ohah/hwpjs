# HWPX 차트 값의 ST_Xstring 해석

[차트 텍스트 관측](hwpx-chart-text.md)의 `c:pt/c:v`는 XML 문자 참조 해제와 줄바꿈 정규화가 끝난 UTF-8 본문을 leaf 단위로 모은 뒤 `src/hwpx/xstring.zig`에 전달합니다. [OOXML ST_Xstring 구현 참고](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/d34ae755-c53f-4a44-a363-c6dd3ee018a4)의 `_xHHHH_`(16진수 네 자리) 이스케이프를 한 번만 왼쪽에서 오른쪽으로 해석합니다. `_x005F_x0008_`는 리터럴 `_x0008_`이며 재귀적으로 U+0008로 바꾸지 않습니다. 연속한 UTF-16 상·하위 서로게이트 이스케이프는 하나의 Unicode scalar로 합칩니다. 짝이 없는 서로게이트는 임의 대체 문자로 만들지 않고 `unsupported_xstring_surrogates` 진단으로 노출하며 해당 값의 해독 바이트 수는 합산하지 않습니다.

해석 대상은 차트 캐시·리터럴의 직접 `pt/v`입니다. [차트 수식 참조](hwpx-chart-formula.md)의 `c:f`는 일반 문자열이므로 같은 패턴이 있어도 해독하지 않습니다. XML 이벤트가 이스케이프 중간에서 갈라져도 leaf 전체에 대해 한 번 처리합니다. 모양이 맞지 않는 `_x` 조각은 일반 텍스트로 둡니다. 이 계층은 숫자 변환, 수식 평가, Unicode 정규화, 원문 보존, 문서 모델 편집·저장을 하지 않습니다.

기존 `value_text_bytes`·`max_observed_value_bytes`·`empty_values`는 XML 정규화 직후의 바이트 수입니다. 추가한 `xstring_escape_sequences`는 인식한 이스케이프 수, `xstring_decoded_values`·`xstring_decoded_bytes`는 해독 가능한 leaf의 수와 해독 직후 UTF-8 바이트 합계입니다. 해독 버퍼는 관측 후 해제하며 보고서에는 값 자체가 없습니다. 입력 leaf 1 MiB·전체 64 MiB 한도는 기존 XML 정규화 바이트에 적용하고 해독 출력에도 leaf 한도를 적용합니다. `unsupported_xstring_surrogates`는 캐시 문제 합계와 첫 문제 ZIP 경로에 포함됩니다.

## 검증 경계

단위·통합 테스트는 제어문자, 한글, 대소문자 16진수, 이스케이프 리터럴 밑줄, XML CharData·CDATA 경계, 서로게이트 쌍·짝 없음, 유효하지 않은 패턴, 정확한 출력 한도·UTF-8 손상·할당 실패를 검사합니다. 수식에 있는 `_x0008_`가 일반 문자열로 남는 것도 검사합니다. 선택 제품 조사 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus chart path and XML read-only survey'`는 `reference/rhwp`와 레거시 fixture의 HWPX 484개 중 476개 수용 문서·차트 파트 93개에서 값 2,296개를 읽었고, 이스케이프 0개·짝 없는 서로게이트 0개·해독 값 2,296개·해독 UTF-8 합계 12,374바이트를 관측했습니다. corpus에 이스케이프가 없으므로 실파일이 해독 규칙의 정확성을 증명하지는 않습니다. 새 인코딩 표본이 들어오면 별도 독립 구현과 대조해야 합니다.

이 변경에서 HWPX ReleaseFast 전용 테스트 120개, 기본 `zig build test --summary all` 2,145개, Debug·ReleaseSafe·ReleaseFast 전체 `zig build audit --summary all`, ReleaseSafe 제품 빌드·JS 비교, 독립 Python 원문 텍스트 조사 모두 통과했습니다. 독립 조사는 Xstring 해독을 수행하지 않으므로 원문 길이·개수 회귀 대조일 뿐 해독 oracle이 아닙니다. 전체 HWPX 문서 모델이나 편집·저장 지원을 뜻하지 않습니다.
