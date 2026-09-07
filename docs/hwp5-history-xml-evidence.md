# 이력 HWPML·DiffML의 독립 XML 조사

[최종 문서 구조](hwp5-history-last-document.md) · [개발 명령](development-commands.md)

## 범위와 출처

이 단계는 제품 XML 파서나 이력 복원기가 아니라 **실제 payload의 읽기 전용 조사와 회귀 검사**입니다. 기존 Zig 검사는 레코드/UTF-16 길이/압축/예산을 검사하며, 새 외부 XML 검사를 제품 지원 범위로 자동 승격하지 않습니다.

한컴의 [HWP 3.0/HWPML 공식 PDF](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D3.0_HWPML_revision1.2.pdf)를 참조했습니다. 로컬 `legacy/rust/documents/docs/spec/hwp-3.0-hwpml.md`는 내용 준비 중인 파일이므로 이를 완성된 명세로 취급하지 않습니다. HWP5의 DIFFDATA/LASTDOCDATA 태그 설명과 아래 실측 명령/속성의 의미를 구별합니다. 검색에서 찾지 못했다는 이유만으로 형식이 존재하지 않거나 비공개라고 확정하지 않습니다.

## 실측

대상은 `reference/rhwp/samples/basic/treatise sample.hwp` 한 파일입니다. strict CFB를 읽고 Node zlib로 이력 stream의 압축 및 CRC32/ISIZE 꼬리를 독립 검사했습니다. 전체 decoded 이력은 13,292,279바이트이며, 아래 수치는 그 안의 XML payload입니다.

| 소스 | XML 바이트 | 루트 | 전체 요소 | PATH 속성 | OLD 속성 |
|---|---:|---|---:|---:|---:|
| VersionLog0 DIFFDATA | 20 | HMLDIFF | 1 | 0 | 0 |
| VersionLog1 DIFFDATA | 6,410 | HMLDIFF | 132 | 122 | 0 |
| VersionLog2 DIFFDATA | 19,788 | HMLDIFF | 289 | 263 | 113 |
| VersionLog3 DIFFDATA | 81,082 | HMLDIFF | 897 | 317 | 51 |
| HistoryLastDoc LASTDOCDATA | 13,184,598 | HWPML | 1,235 | 0 | 0 |

이 다섯 payload는 현재 환경의 xmllint(libxml 2.9.13)에서 XML로 파싱되었습니다. 스키마 유효성, HWPML의 모든 필드 지원, 다른 버전에서의 XML 저장 배치까지 증명하지 않습니다.

관측된 PATH에는 `HWPML[1]`, `BODY[1]`, `P[97]`, `text()[1]`, `@Pos` 등이 있습니다. UPDATE가 중첩되고 POSITION/DELETE/INSERT도 나타납니다. 그러나 전역 태그 이름 개수는 명령 수가 아닙니다. **최종 HWPML 자체에도 POSITION이 9개** 있고, DiffML 내부에 포함된 문서 요소 역시 같은 이름을 가질 수 있습니다. 보고서 필드는 따라서 positionElements 등 이름별 요소 수로 표현합니다. 선택자는 namespace 없는 이름을 세며 모든 namespace의 의미적 동종 요소를 합산하는 도구가 아닙니다.

VersionLog3의 `CARETPOS[1]` 아래 `@Pos` UPDATE에는 OLD 값 16이 있습니다. 최종 문서 `/HWPML/HEAD/DOCSETTING/CARETPOS/@Pos`는 32입니다. OLD를 그대로 새 값으로 적용하는 단순 정방향 복원은 이 관측과 맞지 않습니다. 역방향 복원 가설과 양립하지만 **방향·적용 순서·기준 버전이 검증된 것은 아닙니다**. 조사 결과도 restorationDirectionVerified=false로 남깁니다.

## 책임과 안전 경계

- `history-xml-source.mjs`: 위 고정 표본의 정확한 이력 경로, Node의 bounded raw DEFLATE, 선택적 CRC32/ISIZE 확인, 전체 decoded 한도 16 MiB. 기존 JS 이력/최종 문서 oracle을 재사용합니다. 일반 HWP 파일용 신규 파서가 아닙니다.
- `history-xml-query.mjs`: UTF-16LE 입력 준비, 외부 XML 프로세스의 입력·시간·출력 한도, 정해진 통계의 결과 형태. XML 이름 문법은 외부 파서가 소유하며 별도 ASCII 정규식으로 제한하지 않습니다.
- `history-xml-survey.mjs`: 표본 결과 고정 대조, OLD/최종 값 관측, 실제 XML 파서의 거부/복구 검사. 원문이나 OLD 값을 적용하는 쓰기는 없습니다.
- `history-xml-query.test.mjs`: 외부 프로세스를 주입해 경계·오류 처리를 검사합니다. 기본 audit에 포함되지만 xmllint 설치를 요구하지 않습니다.

XML 입력은 홀수 바이트나 고립 서로게이트이면 프로세스를 실행하기 전에 거부합니다. UTF-16LE BOM은 외부 XML 입력용으로만 보충하고 기존 BOM은 중복 추가하지 않습니다. HWP 원문은 수정하지 않습니다. 원문 전체에 `<!DOCTYPE`가 있으면 보류 오류로 멈춥니다. 주석/CDATA의 같은 문자열도 보수적으로 거부하므로 이 준비 단계는 일반 XML 언어의 완전한 검증기가 아닙니다.

xmllint는 `--nonet --xpath … -`로 stdin만 전달받습니다. shell, entity 치환, DTD 로드, XInclude 처리, 복구, huge 옵션을 켜지 않습니다. `--nonet`만으로는 로컬 파일 entity를 막을 수 없으므로 위 사전 거부를 함께 적용합니다. 기본 프로세스 시간은 5초, 출력 한도는 1 MiB이며 실패/timeout/출력 초과에 부분 결과를 성공으로 반환하지 않습니다. stderr에는 문서 내용이 포함될 수 있어 출력하지 않습니다. 파일 쓰기·문서 업로드·외부 entity 조회는 하지 않습니다.

## 적대적 검토와 수정

1. 첫 실행에서 공개 조회 결과의 type을 편집 모델의 kind로 잘못 읽어 실패했습니다. 제품 버그가 아니라 조사 도구의 필드 혼동이었으며 type 확인으로 수정하고 fake CFB 진입점 회귀 검사를 추가했습니다.
2. 단일·전체 decoded 한도의 정확한 값과 부족한 값, CRC·ISIZE·잘못된 꼬리, 누락 stream과 잘못된 kind를 검사합니다. 오류를 내부 부재/유효 XML로 바꾸지 않습니다.
3. 입력 바이트·UTF-16·DOCTYPE 검사가 spawn 전에 실행되는지, 외부 프로세스의 인자/timeout/출력 초과/실패를 주입해 확인합니다. 원본 불변성, BOM, astral 문자와 비ASCII XML 이름도 확인합니다.
4. 실제 xmllint에서 미종결 태그, 중복 속성, 미정의 entity, NUL의 네 입력을 거부했습니다. 1,000단계 중첩은 XML 문법 자체가 아니라 현재 파서의 기본 자원 제한으로 거부됩니다. 이 둘을 모두 문법 오류라고 부르지 않습니다. 이후 정상 astral 문자 및 namespace 있는 XML 입력으로 복구를 확인합니다.
5. 이름별 요소 수와 명령 수를 분리했습니다. 향후 구현은 UPDATE의 문맥과 삽입/삭제 문서 조각의 소유권을 나눠야 하며, 전역 `//POSITION` 같은 선택자를 복원 명령 수집기로 사용하면 안 됩니다.

## 실행 결과

Debug → ReleaseSafe → ReleaseFast의 전체 `audit`를 순차 실행해 각각 17/17 빌드 단계, 네이티브 302/302, HWP5 1,629,453 checks가 통과했습니다. 새 XML 경계 테스트는 각 실행에서 6/6이며 기존 Node 테스트와 별도입니다. 각 모드의 `history-xml-audit`도 7/7 단계가 통과했고 위 다섯 payload의 통계, OLD/최종 caret 관측, 거부 입력 5개와 정상 입력 복구를 확인했습니다.

로그는 `/tmp/hwpjs-history-xml-audit-{debug,safe,fast}.log`와 `/tmp/hwpjs-history-xml-survey-{debug,safe,fast}.log`입니다. `zig fmt --check build.zig src`, 변경 JS 네 파일의 `node --check`, `git diff --check`, 변경 문서의 로컬 링크 7개 존재 확인도 통과했습니다. 실행 수치는 표본과 경계 검사의 결과이지 전체 XML/HWP 스키마 지원률이 아닙니다.

## 외부 도구 부재 검증

`PATH=/nonexistent`와 현재 Node 실행 파일의 절대 경로를 사용한 별도 실행에서 단위 테스트 6/6이 통과했습니다. 같은 환경에서 실제 `inspectXml` 호출은 `XmlProcessFailed`로 실패했습니다. 기본 테스트가 xmllint에 몰래 의존하지 않고, 외부 조사도 도구 부재를 성공/skip으로 숨기지 않는 것을 실측했습니다. 이 환경 변경은 해당 프로세스에만 적용했습니다.

## 다음 구현의 통과 조건

제품용 bounded XML 읽기와 노드/속성 소유권, DiffML 명령과 포함 문서의 구분, PATH/인덱스/문자 노드의 좌표, OLD와 삽입·삭제의 적용 방향/순서, 기준 버전이 필요합니다. 복원 전후를 확인할 수 있는 한글 생성 표본으로 이를 검증한 뒤 HWPML 모델과 연결해야 합니다. 현재는 독립 XML 파싱 성공만 추가로 확인했으며 복원·편집·저장은 미구현입니다.
