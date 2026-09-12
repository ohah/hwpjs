# CLineItem v1 경계 조사

## 범위와 근거

[nullable 제목 축](hwp5-chart-nullable-title-parser.md) 다음의 선택된 CLineItem 후보를 읽기 전용으로 검증했습니다. `hwp-spec`의 4.3.9.6절은 Contents가 OLE 내부 차트 스트림임을 설명하며, 별도 차트 문서를 참조합니다. 해당 절과 차트 revision 1.2의 공개 속성 설명만으로 내부 raw52의 필드 순서·폭·의미를 유도하지 않았습니다.

`tests/hwp5/chart-line-item-evidence.mjs`는 호출자가 지정한 위치에서 객체 ID → VtCLineItem v1 타입 → raw52 → VtObject v1 기반 타입 한 개를 읽습니다. 새 타입 선언과 기존 참조를 구별하고, 앞선 타입 Map과 객체 ID Set을 복사해 사용합니다. 입력·앞선 사전을 변경하지 않고 원시 바이트는 hex 문자열로 반환합니다. null ID와 앞선 범위에 이미 등록된 객체 ID는 거부하며 0은 유효한 ID로 유지합니다.

길이 후보를 재시도하거나 타입 이름을 검색해 동기화하지 않습니다. 한 객체 조사기는 앞의 u16을 소비하지 않으며, 고정 개수 반복도 소유하지 않습니다. 조사 도구만 현재 corpus의 두 후보를 명시적으로 선택합니다. 제품 파서·WASM mode·일반 Chart 소유권/개수 규칙은 추가하지 않았습니다.

## 실제 파일 실측

`chart-line-item-survey.mjs`는 기존 nullable 축 oracle이 반환한 전체 선행 객체 ID 집합 및 타입 사전을 이어 사용합니다. 584개 HWP corpus의 차트 Contents 43개에서 86개 후보가 해당 배치에 맞았습니다. 첫 항목은 CLineItem 새 선언을 포함한 80바이트, 두 번째는 기존 타입 참조를 사용한 64바이트였습니다. 앞선 u16은 모두 1, raw52는 두 종류였습니다. 이는 선택된 표본의 분포이며 유효값 제약이 아닙니다.

`--verify` 결과는 모든 잘림 6,192건, 새 타입명/버전 및 기존 타입 버전 오류 215건, null·선행 범위 중복 ID 172건, raw52 전체 변조 86건입니다. 정확한 끝에서 파싱, 뒤쪽 바이트 변조 무관성, 실패 후 원본 재파싱 및 입력 Map/Set 불변성도 대조했습니다. 의도된 오류는 정확한 Error 생성자와 오류명으로 판정합니다. 결과는 `/tmp/hwpjs-chart-line-item-survey.json`에 기록했습니다.

```sh
node --test tests/hwp5/chart-line-item-evidence.test.mjs
node tests/hwp5/chart-line-item-survey.mjs --verify
```

조사 명령은 기존 `zig-out/bin/hwpjs.wasm`을 CFB 읽기에 사용합니다. 새 CLineItem 제품 WASM 검증이라는 뜻은 아닙니다.

## 적대적 검증과 회귀

신규 단위 테스트 2개는 offset 0/1/17/257, 새/기존 타입, 희소 타입 ID, 객체 0, 연속 객체, raw 보존·수명, 모든 잘림, 타입명/버전 불일치, null/중복 ID, 잘못된 호출 오프셋을 검사합니다. 관련 Axis/Surface/ValueText 조사 테스트를 합쳐 12/12로 통과했습니다.

`/tmp/hwpjs-line-item-mutants.VtyYxJ`에서 시작 위치를 0으로 고정, raw 폭 51로 축소, raw를 0으로 삭제, 버전 검사 삭제, 중복 검사 삭제, null 검사 삭제, 입력 타입 Map 직접 변경, 입력 객체 Set 직접 변경의 8종을 만들었습니다. 모두 node 구문 검사를 통과한 뒤 실제 테스트 실패와 종료 코드 1로 검출했습니다. SyntaxError/ReferenceError를 결함 검출로 세지 않았습니다.

기존 nullable oracle에는 선행 객체 ID Set 반환만 추가했습니다. 코어나 wire 형식은 바꾸지 않았습니다. 이전 제품 구현의 세 모드 전체 audit 성공은 해당 파트 기록에 남겨 두며 이번 조사 검증으로 재사용하지 않습니다.

이번 변경 후 기존 ReleaseSafe 테스트 WASM으로 nullable 대조 43개/정상 301건/오류 12,298건과 필수 축 172개/정상 344건/오류 106,570건을 다시 실행해 통과했습니다. 출력 변조·동일 메시지 trap 주입도 검출했습니다. 제품 코드 변경이 없는 조사 파트이므로 세 모드 전체 audit는 이번에 재실행하지 않았습니다.

## 남은 범위

raw52의 의미와 일반 버전/확장 배치, 앞의 u16 의미, 두 항목의 소유 관계, 뒤쪽 데이터 조립은 아직 미확인입니다. 후속 단일 CLineItem 코어와 실제 WASM 대조는 [코어 계약·검증](hwp5-chart-line-item.md)에 기록합니다. Chart 전체 지원이나 렌더링 완료를 주장하지 않습니다.
