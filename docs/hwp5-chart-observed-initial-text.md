# 전체 Contents의 Footnote·Legend 반환값 대조

범위는 [명시적 배치의 Contents 조립](hwp5-chart-observed-contents.md)이 반환한 초기 Footnote·Legend입니다. 제품 파서의 지원 배치를 넓힌 변경이 아니라, 개별 파서에만 있던 반환값 검사를 전체 조립에도 연결한 변경입니다.

## 책임과 검사 범위

- `chart-footnote-probe.zig`·`chart-legend-probe.zig`의 결과 직렬화를 공유합니다. 전체 probe는 이미 반환된 객체를 전달하며 입력을 다시 파싱해 실제 반환값을 대신하지 않습니다.
- 기대값은 독립 JS 관측에서 만듭니다. Legend의 객체·문자열 총계는 전체 Tail까지 읽은 scope를 명시적으로 전달합니다. 개별 Legend 종료 시점의 총계와 혼동하지 않습니다.
- 기존 wire의 문자열 바이트·ID·trailer, 폰트/Section/Backdrop 원시 구간과 Legend 문자열 도입 여부를 연결했습니다. Footnote/Legend의 `section.end`, 두 Section의 `backdrop.end`, `prefix.end`도 실제 반환 필드를 각각 직렬화합니다. 같은 값일 것으로 예상되는 종료 위치도 다른 필드로 대체하지 않습니다.
- `chart-string-length-variant.mjs`가 관측된 inline String의 길이 변경을 소유합니다. 개별 Footnote·Legend 검사와 전체 검사가 공유하며, 뒤쪽 필드부터 교체하고 Contents extent를 갱신합니다. 임의 파일에서 문자열 위치를 찾는 제품 기능이 아닙니다.

## 실측

기존 corpus에서 선택한 43개 Contents 경로를 대상으로 실행했습니다. 경로 수를 고유 파일 해시 수로 해석하지 않습니다.

| 검사 | 정상 대조 | 기대 오류 거부 |
|---|---:|---:|
| 전체 조립 기본 검사, 세 모드 각각 | 1,409 | 946 |
| 전체 조립 모든 잘림, ReleaseSafe | 1,409 | 383,314 |
| 개별 Footnote, ReleaseSafe | 301 | 21,199 |
| 개별 Legend, ReleaseSafe | 258 | 11,211 |

전체 조립 숫자는 앞선 파트의 변형도 포함한 누적 검사입니다. 이번에 추가한 입력은 원시 구간 변형 43건과 Footnote/Legend 문자열 길이 0·1·65535 변형 258건입니다. 모든 잘림은 원본 43개에서 382,411개 위치를 검사했으며, 모든 변형 입력의 모든 위치를 자른 것은 아닙니다. 거부 뒤 원본의 전체 반환 wire를 다시 대조했습니다. 기대 오류는 정확한 `Error` 생성자와 오류명으로 검사하여 host 예외나 WASM trap을 성공으로 세지 않습니다.

Legend 원본에서는 기존 문자열 재참조 41건, 새 문자열 도입 2건을 확인했습니다. 직렬화 분리 전 HEAD와 현재 개별 테스트의 `(mode, limit, input length, input bytes)` 호출열 및 결과를 대조했습니다.

| 검사 | 호출 수 | 호출열 SHA-256 |
|---|---:|---|
| Footnote | 42,699 | `e7741424843d0b1409fde6e3b37750d5c39b4d629b50ac757d0af5fa695d2290` |
| Legend | 22,680 | `5b7945fbf8ad9fa5f53813be5e4cdd4fc563a4c7bf515f3ee2cd75c63a48b691` |

Legend oracle 자체도 원본 43건에서 새로 노출한 8개 메타데이터 필드를 제외한 모든 기존 결과와 wire가 HEAD와 같았습니다.

## 실제 코어 결함 주입

임시 복사한 제품 코어의 반환 직전에 아래 13종을 각각 삽입했습니다. Debug·ReleaseSafe·ReleaseFast 총 39개 모두 컴파일 종료 코드 0 후 실행 종료 코드 1과 `ERR_ASSERTION`으로 검출했습니다. 각 모드의 무변조 대조군은 정상 1,409·거부 946건을 통과했습니다.

- Footnote: ID 변경, 폰트 이름/본문 바이트 강제 비움, Section raw 초기화, Section/Backdrop 종료 위치 변경 — 6종.
- Legend: ID 변경, 이름 바이트 강제 비움, 문자열 도입 여부 반전, raw 초기화, Section/Backdrop 종료 위치 변경 — 6종.
- 초기 Prefix 종료 위치 변경 — 1종.

검사기는 저장소의 mode 336 전체 조립 검사를 사용했습니다. 임시 산출물은 `/tmp/hwpjs-initial-text-mutants.TsdVfG`의 `종류-모드.compile.log`·`종류-모드.log`입니다. 임시 파일은 보존을 보장하지 않으며 결함은 저장소 제품 코드에 반영하지 않았습니다.

## 남은 범위

### 후속: Footnote 상태값

전체 probe에 `font.name_introduced`, `text_introduced`, `backdrop != null`을 각각 실제 반환 필드에서 읽어 추가했습니다. 기대값 1/1/0은 기존 독립 Footnote oracle이 두 String을 inline으로 읽고 auxiliary의 null을 검증하는 선택 배치에서 나옵니다. 제품 결과에서 기대 상태를 복사하지 않습니다. non-null 보조 Backdrop 지원 배치를 새로 추가한 것은 아닙니다.

임시 코어에서 두 introduced 값을 각각 false로 바꾸거나 null Backdrop에 전환 Backdrop을 넣는 3종을 주입했습니다. 세 모드 총 9건 모두 컴파일 종료 코드 0 후 `ERR_ASSERTION`·실행 종료 코드 1로 검출했습니다. 정상 코어는 세 모드 각각 정상·변형 1,452건·기본 거부 946건을 통과했습니다. 로그는 `/tmp/hwpjs-footnote-flags.SclyWx`의 `종류-모드.compile.log`·`종류-모드.log`이며 제품 소스는 변경하지 않았습니다.

Footnote의 위 상태값은 후속 검사에 연결했습니다. 현재 선택 배치에서 허용하지 않는 non-null 보조 Backdrop의 내용을 이 검사로 검증했다고 해석하지 않습니다. Grid 전환 Backdrop은 후속 [Grid 반환값 검사](hwp5-chart-observed-grid.md), 개별 타입/객체 값은 [사전 엔트리 대조](hwp5-chart-observed-tables.md), 현재 제품이 반환하는 객체 Reference 위치는 [축 반환값 대조](hwp5-chart-observed-axes.md)와 기존 Series wire에 연결했습니다. 합계가 같다는 사실은 각 엔트리가 같다는 증거가 아닙니다.

이후 사전 엔트리 검사까지 포함한 누적 세 모드 전체 audit가 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다. 전체 문서 검증 완료나 모든 차트 배치 지원을 뜻하지 않습니다.
