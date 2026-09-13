# 전체 Contents의 축 반환값 대조

## 범위와 책임

[명시적 배치 조립](hwp5-chart-observed-contents.md)의 mode 336 시험 출력에 주축 배열 순서와 보조축을 추가했습니다. `chart-axes-probe.zig`의 결과 전용 serialize와 독립 `chart-axes-oracle.mjs`의 axisWire를 재사용합니다. 개별 축 종료 시점이 아닌 전체 Contents 종료 시점의 객체·문자열 총계를 명시적으로 전달합니다. 제품 파서의 배치 판정이나 지원 형식을 바꾼 작업은 아닙니다.

추가 대조는 축 ID/end/raw82, 제목 TextBlock/Font/String, Scale 유무·배열·ValueBlock, Tail 유무·원시 구간/end를 기존 wire 수준으로 검사합니다. 전체 조립 반환 객체를 직접 직렬화하며 입력을 다시 파싱한 결과로 대신하지 않습니다. ValueBlock 내부 Reference/label의 start/end처럼 기존 wire에 없는 중첩 필드는 아직 별도 대조하지 않습니다.

## 표본 밖의 분기

- `chart-axis-title-variants.mjs`: null 보조축 제목을 기존 font-name 참조, 새 빈 문자열, 새 원시 문자열 `ff 80 00`으로 바꾸는 시험 생성기입니다. 기존 개별 보조축 검사와 전체 조립 검사가 공유합니다.
- `chart-axis-tail-variant.mjs`: selector 0·추가 Tail 없음 전제를 확인한 뒤 selector 1과 24바이트 `a5` 구간을 삽입합니다. 실제 파일에서 발견했다는 뜻이 아닌, 지원된 선택 배치의 합성 입력입니다.
- 전체 조립 검사는 null 및 세 제목 변형 각각에 추가 Tail을 조합합니다. 원시 필드 변형에서도 배치 selector는 유지하고, 소비되는 원시값은 실제 반환 wire와 대조합니다.

원본 파일은 수정하지 않습니다. 길이가 달라진 메모리 입력의 Contents extent도 갱신합니다. 보조축의 Scale 있는 배치 등 아직 조합하지 않은 분기는 남아 있습니다.

## 실측

ReleaseSafe 전체 조립 probe에서 실제 차트 43개를 기반으로 정상·변형 430건과 기본 오류 172건이 통과했습니다. 모든 잘림 실행도 정상·변형 430건, 잘림 382,411건, 한도·후행 바이트 포함 오류 382,540건을 통과했습니다. 오류 뒤 원본 반환 wire를 다시 대조합니다.

기존 개별 보조축 검사는 정상 301건·오류 12,298건입니다. HEAD의 검사 함수와 공통 생성기 추출 후 함수를 같은 WASM으로 실행하고 호출 mode·limit·입력 길이·바이트를 순서대로 해시했습니다. 24,897개 호출과 결과가 일치했으며 SHA-256은 `df785011c0a9bbe54d203ef2f2b690cdc9795e19b41060e38c6bc7e7c31a21ec`입니다. 첫 비교 시 임시 data-module의 상위 상대 import를 해결하지 못한 실행은 제외하고, 모든 상대 import를 절대 경로로 해석한 뒤 성공을 확인했습니다.

## 적대적 검증

임시 디렉터리 `/tmp/hwpjs-axis-return-mutants.tbcElm`에 코어 소스 복사본과 mode 336만 노출하는 작은 시험 bridge를 만들었습니다. 원래 제품 소스는 변경하지 않았습니다. 다음 10개 소스 변형을 Debug·ReleaseSafe·ReleaseFast에서 검사했습니다.

| 변형 | 개수 |
|---|---:|
| 전체 주축 raw82 삭제 | 1 |
| 주축 Scale 삭제 | 1 |
| 주축 추가 Tail 삭제 | 1 |
| 보조축 제목을 강제로 null 처리 | 1 |
| 주축 0/1/2/3 각각의 raw82 삭제 | 4 |
| 보조축 raw82 삭제 | 1 |
| 보조축 추가 Tail 삭제 | 1 |

30건 모두 컴파일 성공 후 실제 대조에서 ERR_ASSERTION·종료 코드 1로 실패했습니다. 컴파일 실패나 임의 trap을 검출 성공으로 대신하지 않았습니다. 정상 코어와 같은 작은 bridge는 세 모드 각각 정상·변형 430건, 기본 오류 172건을 통과했습니다. 각 변형의 `*.compile.log`와 실행 `*.log`는 위 임시 경로에 있습니다.

기존 검사기 방어 검사도 동일 메시지의 호스트 예외 3종과 출력 바이트 변조 8종을 검출했습니다. 이 축 확장은 정규 audit가 호출하는 smoke에 연결됐으며 후속 누적 세 모드 전체 audit도 통과했습니다. 최종 수치와 로그는 [사전 엔트리 대조](hwp5-chart-observed-tables.md)가 소유합니다.
