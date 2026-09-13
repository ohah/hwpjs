# 전체 Contents의 Plot·Surface·Tail 대조

## 책임과 범위

[Contents 조립](hwp5-chart-observed-contents.md)의 mode 336에 Plot·Surface·Tail 반환 wire를 연결했습니다. 개별 Plot/Surface probe의 header/원시 구간 출력과 Tail probe의 출력 함수를 재사용합니다. JS는 `plotSurfaceWire`·`tailWire`로 독립 관측 결과를 조립합니다. 기존 개별 파서의 종료 scope와 전체 Contents 종료 scope는 명시적으로 구분합니다.

Plot ID·초기 배열의 ID/word/end·raw136/end, Surface ID·배열의 ID/word/end·raw30/raw46/end, Tail List ID/word/end·raw26·Window word/end를 대조합니다. Window 앞의 원시 구간을 임의로 객체 ID로 해석하거나 Array 소유권을 새로 추정하지 않습니다. 제품의 선택 배치·버전 지원 정책은 바꾸지 않았습니다.

기존 wire가 누락했던 다음 중복 경계도 전체 조립 출력에 추가했습니다. 값이 이웃 필드와 같더라도 반환된 해당 필드를 직접 대조합니다.

- Tail List의 Collection.end와 Window.end
- Light의 배열 end
- 각 Series의 section.end와 suffix.end

Grid 셀·Prelude 원시 필드는 후속 [Grid 반환값 대조](hwp5-chart-observed-grid.md)에서 확장했습니다. Footnote/Legend, 일부 축 ValueBlock 내부 reference/label의 start/end, 테이블의 개별 엔트리 등은 아직 남아 있습니다. 전체 문서 필드 검증 완료가 아닙니다.

## 입력 검사

기존 정상·변형 검사에 Plot/Surface/Tail 원시 구간을 `ff`로 채우고 List·Window word를 바꾸는 입력을 추가했습니다. Plot·초기 배열·Surface·Surface 배열·Tail List의 ID를 기존 객체와 겹치지 않는 새 ID로 바꾼 입력도 대조합니다. ID 후보 선택은 시험 입력 생성이며 제품의 식별자 추론 로직이 아닙니다.

위 다섯 ID 위치 각각에 null/기존 초기 객체 ID를 넣고, Plot·Surface 배열의 word를 불일치 또는 동일 비영 값으로 바꿔 정확한 오류명을 확인합니다. Scope 주입으로 격리한 기존 개별 검사를 전체 조립 진입점의 검사로 대신 세지 않았습니다.

ReleaseSafe 실측은 정상·변형 817건, 기본 오류 946건입니다. 모든 잘림 실행은 정상·변형 817건, 잘림 382,411건, 한도·후행 바이트·새 ID/배열 오류를 합쳐 거부 383,314건을 통과했습니다. 각 오류 뒤 원본을 재파싱하고 반환 wire를 대조합니다.

## 기존 검사 보존

| 개별 검사 | 정상 | 오류 |
|---|---:|---:|
| Plot | 172 | 9,030 |
| Surface | 172 | 5,934 |
| Tail | 129 | 3,870 |

HEAD의 기존 함수와 공통 출력 추출 후 함수를 같은 WASM으로 실행했습니다. Plot/Surface는 mode·limit·입력 길이·바이트 순서가 30,272개 호출에서 같고 SHA-256은 `b2f3e4e4c6298c70b23acd92438e08c4fbb3f81d2e0b0a28cf7ab122d9cc9bc9`입니다. Tail은 7,869개 호출, `5af43fc4b396c821300ab32cb80e4f5b077105351a734e97903df00e50daece7`이며 검사 결과도 일치합니다.

## 적대적 검증

`/tmp/hwpjs-envelope-mutants.WmBeGC`의 임시 코어 복사본에 다음 16종을 주입했습니다. 제품 소스는 변경하지 않았습니다.

| 반환값 손상 | 개수 |
|---|---:|
| Plot raw136·ID·초기 배열 end | 3 |
| Surface raw30·raw46·ID·배열 end | 4 |
| List ID·List word·Window word·Tail raw26 | 4 |
| Collection.end·Window.end | 2 |
| Light 배열 end | 1 |
| 첫 Series section.end·suffix.end | 2 |

Debug·ReleaseSafe·ReleaseFast의 48건 모두 컴파일 성공 후 실제 wire 대조에서 ERR_ASSERTION·종료 코드 1로 실패했습니다. Series 경계 손상은 첫 항목에 주입한 검사이며 모든 Series 위치에 주입했다고 확대하지 않습니다. 정상 코어의 작은 mode 336 bridge는 세 모드 각각 정상·변형 817건, 기본 오류 946건을 통과했습니다. compile/run 로그는 해당 임시 경로의 `*.compile.log`·`*.log`에 있습니다.

동일 메시지의 호스트 예외 3종·출력 바이트 변조 8종도 검출했습니다. 이 확장은 정규 audit의 smoke에 연결됐고 후속 누적 세 모드 전체 audit도 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다.
