# 전체 Contents의 Light·선 항목·PostLine 대조

## 연결과 SSOT

[Contents 조립](hwp5-chart-observed-contents.md)의 mode 336에 Light·선 항목·PostLine 반환 wire를 추가했습니다. 기존 개별 probe의 결과 직렬화를 공통 함수로 추출했습니다. 선 항목은 헤더 작성과 원소 작성도 공유하므로 개별 파서가 임시 배열을 새로 소유할 필요가 없습니다. 전체 조립은 반환된 배열과 원시 line_word를 직접 전달합니다.

JS 기대값은 `chart-light-wire.mjs`, `lineItemsWire`, `postLineWire`가 독립 관측 결과로 만듭니다. 전체 Contents 종료 시점의 타입·객체 총계를 명시적으로 받으며 개별 파서의 종료 scope로 대신하지 않습니다. 제품 serializer에서 기대 바이트를 생성하지 않습니다.

이 파트의 wire는 Light ID/end/raw10, 광원 배열의 ID/word/원소 수, 각 광원의 ID/start/end/raw16, 선행 line_word, 각 선 항목 ID/end/raw52, PostLine raw194·배열 ID/두 word/end를 대조합니다. 당시 기존 Light wire에 없던 `light.array.end`는 후속 [Plot·Surface·Tail 대조](hwp5-chart-observed-envelope.md)에서 추가했습니다. 모든 반환 필드 완료 주장은 아닙니다.

## 입력 변형

- 원시 Light/광원/선 항목/PostLine 구간을 `ff`로 바꾸고 line_word를 65535로 바꿉니다. 개수·EOF만 아닌 실제 반환값 보존을 확인합니다.
- `chart-light-source-variant.mjs`가 기존 개별 Light 검사와 전체 조립 검사의 광원 수 변형을 공유합니다. 0개는 첫 광원 타입 선언도 제거하고, 증가 시 기존 타입 참조와 새 객체 ID를 사용합니다. base type ID는 관측기가 실제 검증한 값이며 변형 생성기에 숫자 4를 고정하지 않습니다.
- 전체 조립에서 표본별 0개 및 기존 개수+1을 검사합니다. 개별 Light 검사의 65535개 경계 입력도 유지했습니다. 이는 큰 광원 수의 전체 조립 검증 완료를 뜻하지 않습니다.
- PostLine의 두 word를 `(0,0)`, `(65535,65535)`, `(0,65535)`, `(65535,0)`으로 바꿉니다. 이때 선택 Series 개수를 별도로 전달합니다. 표본의 첫 word로 Series 개수를 선택하던 oracle의 기본 동작을 변형 입력에 적용하지 않습니다. 제품은 원래부터 Layout의 명시적 개수를 사용하며 이 원시 word를 개수로 강제하지 않습니다.

입력 Buffer만 변형하고 길이가 바뀌면 Contents extent도 갱신합니다. 원본 파일과 제품 소스는 변경하지 않았습니다.

## 실측

ReleaseSafe 전체 probe에서 정상·변형 731건, 기본 오류 172건이 통과했습니다. 모든 잘림 실행에서는 잘림 382,411건, 한도·후행 바이트 포함 오류 382,540건과 정상·변형 731건이 통과했습니다. 각 오류 뒤 원본 wire를 재대조합니다.

| 기존 개별 검사 | 정상 | 오류 | 리팩터 전후 동일 호출 수 |
|---|---:|---:|---:|
| Light | 173 | 6,720 | 13,613 |
| 선 항목(43차트·86항목) | 301 | 6,751 | 13,803 |
| PostLine | 215 | 9,718 | 19,651 |

HEAD의 함수와 추출 후 함수에 대해 mode·limit·입력 길이·입력 바이트의 순서 해시 및 결과가 모두 같았습니다. SHA-256은 Light `b821900a0f6ee23983712799be2fdc76c1f92d0caa3282032ac6706e101fde0a`, 선 항목 `237bd29574577d7a7a34e5a223b0a22339855e0ebd53f7fe55b5087d01b4825c`, PostLine `809506f255112b15b8a9590a3b0d6822822f694e37723b1292f87f4b7e11fa9d`입니다.

별도로 이전 선 항목 oracle의 0/1/2개 선택 129건과 PostLine 43건의 기대 wire를 대조했습니다. 43개 원본 Contents의 기존 전체 wire는 확장된 wire의 접두부와 일치합니다. Plot 관측 결과도 추가한 baseTypeId를 제외하면 이전 결과와 43건 모두 같고, 추가 값은 검증된 VtObject 타입을 가리킵니다.

## 적대적 검증

`/tmp/hwpjs-light-line-mutants.RguPEr`의 임시 코어 복사본에 다음 10종을 주입했습니다. 저장소의 제품 소스는 그대로입니다.

| 소스 변형 | 개수 |
|---|---:|
| Light raw10 삭제 | 1 |
| 광원 0/1/2 각각의 raw16 삭제 | 3 |
| 선 항목 0/1 각각의 raw52 삭제 | 2 |
| line_word를 강제로 0 처리 | 1 |
| PostLine raw194 삭제 | 1 |
| PostLine 첫째/둘째 word 각각 1비트 손상 | 2 |

Debug·ReleaseSafe·ReleaseFast에서 30건 모두 컴파일 성공 후 실제 대조의 ERR_ASSERTION·종료 코드 1로 실패했습니다. 세 번째 광원 손실은 증가 변형 입력 대조에서 검출됐으며 첫 두 위치의 검사 결과로 대신하지 않았습니다. 정상 코어의 작은 mode 336 bridge는 세 모드 각각 정상·변형 731건과 기본 오류 172건을 통과했습니다. compile/run 로그는 위 임시 경로의 `*.compile.log`·`*.log`에 있습니다.

같은 메시지의 호스트 예외 3종과 출력 바이트 변조 8종도 검사 실패로 검출됐습니다. 변경된 smoke는 정규 audit에 연결됐고 후속 누적 세 모드 전체 audit도 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유하며, 지원하지 않는 배치와 남은 중첩 필드는 각 후속 문서의 제한을 따릅니다.
