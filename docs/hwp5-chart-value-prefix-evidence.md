# 첫 배율 값 블록의 라벨까지 조사

## 범위와 책임

읽기 전용 `tests/hwp5/chart-value-prefix-evidence.mjs`가 첫 AxisScaleBlock 내부 배열 헤더 다음부터 첫 ValueBlock의 라벨 String 끝까지 관찰합니다. corpus 순회·이전 타입/문자열 사전 준비·SHA-256·집계는 `chart-value-prefix-survey.mjs`, 합성 경계 검사는 `chart-value-prefix-evidence.test.mjs`가 소유합니다. 이전 경계는 [Axis 조사](hwp5-chart-axis-prefix-evidence.md)와 공통 chart-axis-context를 재사용합니다. 중간 문자열 검색으로 다음 파싱 위치를 찾지 않습니다.

HWP 명세 스킬의 4.3.9.6은 OLE Contents와 OOXMLChartContents의 역할을 구분합니다. 공식 차트 revision 1.2의 AxisScale(3.9), ValueScale(3.59) API 속성은 참고하되, 이를 내부 직렬화 필드 순서로 간주하지 않습니다. 원문 출처는 [Plot 조사](hwp5-chart-plot-evidence.md)에 있습니다. 이 단계는 제품 Zig 파서·WASM ABI·정규 audit를 변경하지 않습니다.

## 실측 결과

기존 584개 HWP corpus에서 선택된 차트 Contents 43개 중 첫 Axis의 배율이 없는 9개는 건너뛰고, 있는 34개를 조사했습니다. 각 입력의 첫 값 블록만 확인한 결과이며 모든 축/값 블록 지원률이 아닙니다.

| 순서 | 관측한 배치 |
|---|---|
| 배열 헤더 다음 | u32 다섯 개 모두 FFFFFFFF |
| 값 블록 시작 | 원시 u32(34개 모두 0), VtValueBlock v1 타입 선언 |
| 선택 String | null 33개, 이전 String ID 재참조 1개 |
| 선택 서식 | null 17개, VtTextFormat v1 17개 |
| 서식 내부 | 원시 헤더 u32, 타입, VtObject v1, 원시 u16, 코드 String |
| 라벨 앞 | 원시 u16 |
| 라벨 | String 객체 또는 기존 String 참조; 여기까지만 소비 |

String은 기존 관측 배치인 ID·VtString v1·u16 길이·원시 바이트·u8 trailer·VtValue v1·VtObject v1을 사용합니다. 재참조는 ID 네 바이트만 소비합니다. 결과의 문자열은 hex 복사값이며 입력 버퍼나 사전 변경 후에도 유지됩니다. 타입/문자열 사전은 복제하므로 실패 시 호출자의 목록을 변경하지 않습니다.

헤더 값 0을 전역 객체 ID로 확정하지 않습니다. 일반 객체 그래프, 이전 비문자열 객체와의 충돌, 임베디드 객체의 식별 규칙을 검사하는 도구가 아닙니다. 다섯 FFFFFFFF를 허용하는 것은 선택 표본의 배치 계약일 뿐, 다른 배치를 가진 HWP 자체가 잘못됐다는 판정이 아닙니다.

## 잘못된 가정의 재현과 수정

초기 조사기는 라벨 뒤에 원시 u16과 u32 TextBlock 헤더가 이어진다고 가정했습니다. 실제 입력에서 UnsupportedValueObservationType으로 실패했습니다. 첫 라벨 끝 뒤 바이트는 `2e 00 00 0d 00 00 00 ...`, 다른 표본은 `00 00 00 0d 00 00 00 ...`였습니다. 이 사실만으로 헤더 폭이나 다음 객체 시작을 확정할 수 없습니다. 해당 소비 코드를 제거하고 경계를 라벨 끝으로 제한했습니다. 0 헤더가 두 번 반복된다는 초기 추정도 확정 사실에서 제외했습니다.

다음 TextBlock 본문, ValueBlock 꼬리, 다른 값 블록, AxisScaleBlock/Axis 전체 끝과 필드 의미는 아직 미확인입니다. 길이 추측이나 타입 문자열 검색으로 강제 연결하지 않습니다.

## 검증과 재현

합성 Node 테스트 3개: null/서식·참조 있음/없음·새 라벨/기존 라벨 조합, offset 0/1/17/257, 원시 헤더 0/비영 값, 희소 타입 ID, 타입 재사용, 모든 잘림·새 클래스/버전 변형, 다섯 슬롯 각각 변형, null 라벨 거부, 잘못된 offset의 명시적 RangeError, 정확한 끝 이후 데이터 무시, 입력/사전 변경 후 결과 수명을 검사했습니다.

실제 34개에서 잘림 **3,875건**, 새 타입 버전 변형 **51건**을 정확한 일반 Error와 오류명으로 거부했습니다. 각 오류 검사 후 원본 재관측 결과도 일치했습니다. 서식 포함 **17개**, 이전 문자열 재참조 **1개**, 값 블록 원시 헤더 0 **34개**입니다.

`/tmp/hwpjs-chart-value-mutants.UPGcdv`의 offset 0 강제, 헤더 원시 값 삭제, 슬롯 검사 생략, 버전 검사 생략, 문자열 재참조 무력화, 서식의 기반 타입 소비 생략, 라벨 앞 원시 값 삭제 등 **7종**은 모두 구문 검사를 통과한 뒤 런타임 테스트 실패(종료 코드 1)로 검출했습니다. 재참조/기반 타입 변형은 정상 입력 파싱 실패도 포함하며 이를 컴파일 오류 검출로 세지 않았습니다.

```sh
node --test tests/hwp5/chart-value-prefix-evidence.test.mjs
node tests/hwp5/chart-value-prefix-survey.mjs --verify
```

survey에는 먼저 빌드한 `zig-out/bin/hwpjs.wasm`이 필요합니다. 이번 변경은 독립 조사 도구와 문서뿐이므로 Zig 전체 3모드 audit를 재실행한 결과로 주장하지 않습니다.
