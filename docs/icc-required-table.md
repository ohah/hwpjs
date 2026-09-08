# ICC 필수 태그와 파싱된 테이블 연결

`required_table.inspect(table,selection)`는 클래스·데이터 색 공간·PCS를 실제 파싱된 헤더에서 가져옵니다. 판본·모델·측정 백색 근거는 호출자가 명시합니다. header_identifiers가 판본 major 일치와 식별자를 검사하고 required_presence가 기존 required_plan의 요구 집합과 테이블 서명 차집합을 계산합니다. 이름 배열을 새로 할당하지 않습니다.

기존 이름 목록 API와 descriptor API는 같은 inspectInventory 구현을 공유합니다. [필수 태그 계약](icc-required-presence.md)의 요구 규칙·모델 제약·미확정 백색·payload/계산 모델 보류를 복제하지 않습니다. v2 필수 요구는 기존처럼 UnsupportedIccRequiredEdition이며 v4 규칙을 자동 적용하지 않습니다. 헤더 scalar·등록부·태그 내용 검증 완료를 주장하지 않습니다.

PNG Options.profile.required는 명시적 선택 또는 null입니다. 모델을 태그 한 개로 추정하지 않기 위해 기본값은 null이며, 이는 누락 없음이 아니라 검사 미선택입니다. 선택하면 원본 프로파일 소유권이 정리된 뒤에도 값 타입 required/missing/보류 보고서를 픽셀 보고서에 보존합니다. 누락을 오류로 숨기지 않고 전체 집합을 보고합니다. ICC 의미·ancillary 보류는 그대로 유지합니다.

## 검증 진행

테이블 테스트는 헤더에서 유도한 클래스·색 공간, 이름 목록 공통 규칙, 누락 집합, 모델 불일치, 판본 불일치와 v2 미지원 거부를 확인합니다. PNG 통합 테스트는 null/선택 구분, 조건부 chad 누락, 보류 전파, 해제 이후 값 보존, 모든 할당 실패 지점 정리를 검사합니다. WASM 독립 대조·세 모드 전체 감사·적대적 검증 결과는 아래에 기록합니다.

첫 전체 Debug 네이티브 실행은 5/5 단계, 696/696 테스트로 통과했습니다.

## WASM 직접 대조

mode240은 선택 여부·판본(2/4)·모델·측정 백색의 4바이트 prefix 뒤 전체 PNG를 받습니다. 출력은 프로파일 존재·검사 선택 결과 존재·의미 보류·ancillary 보류 건수의 u32 LE 16바이트 뒤 기존 필수 태그 wire를 붙입니다. 프로파일 부재와 검사 미선택은 빈 누락 집합으로 대체하지 않습니다. 기존 mode163과 필수 태그 serializer를 별도 파일에서 공유합니다.

Debug 직접 대조는 기존 이름 API 623비교/51거부, PNG 연결 265비교/141거부로 통과했습니다. 독립 이름 집합으로 클래스·모델·백색 조건, 전체 태그 없음·하나씩 누락·역순·미지 태그, 헤더와 선택의 판본 불일치, v2 미지원, 불가능한 모델, probe 경계·한도·잘림·오류 후 재사용을 검사합니다. 태그 payload는 구조 fixture이며 내용 검증 완료를 뜻하지 않습니다.

전체 세 모드 감사는 `/tmp/hwpjs-png-required-{Debug,ReleaseSafe,ReleaseFast}.log`에 순차 실행하여 모두 완료했습니다.

## 적대적 검사와 실제 프로파일

Debug 직접 대조에서 누락 비트 삭제, payload 보류 플래그 삭제, 검사 선택 결과 존재 플래그 삭제, 판본 불일치 오류 승인 변형 4종을 모두 ERR_ASSERTION으로 검출했습니다.

임시 소스 `/tmp/hwpjs-required-table-mutant.kQjNOn/src`에서 실제 output 클래스를 display로 바꿔 계획을 생성하도록 변형했습니다. 세 모드 모두 `required table derives` 테스트가 금지된 출력 matrix 모델의 잘못된 승인을 TestExpectedError로 검출했습니다. 필터 실행은 루트 테스트 블록을 포함해 1통과/1실패였으며 제품 소스는 변경하지 않았습니다. 로그는 `/tmp/hwpjs-required-table-mutant-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

macOS ACESCG Linear·DCI(P3) RGB·Display P3·ITU-2020·ITU-709·ROMM RGB의 실제 v4/display/RGB/XYZ 헤더를 확인하고 원시 프로파일을 PNG에 넣었습니다. 명시한 matrix 모델과 백색 조건 unknown/same/different 각각에서 원본 태그 목록과 요구/누락 집합·보류 플래그를 대조한 18건이 통과했습니다. 백색 조건은 테스트 입력으로 선택한 것이며 실제 측정 백색을 추정하지 않았습니다. 파일은 읽기 전용이며 수동 건수는 정규 audit에 합산하지 않습니다.

## 최종 감사

Debug·ReleaseSafe·ReleaseFast 전체 audit가 모두 종료 코드 0, 20/20 단계, 네이티브 696/696, WASM checks=6,993,193으로 통과했습니다. 이전 6,992,787에 신규 406건이 추가됐습니다. ReleaseSafe·ReleaseFast 실제 감사 산출물에서 기존/PNG 직접 대조와 변형 4종 검출도 통과했습니다.

최종 재검토에서는 실제 헤더 문맥 유도, 명시적 모델·판본·백색 근거, 공통 요구/차집합 규칙, 미선택과 누락 없음 구분, 할당 없는 값 보고서와 해제 후 수명, 실패 시 테이블/압축 해제 버퍼 정리, 기존 mode163 wire 재사용을 확인했습니다. 이번 범위에서 추가 결함은 발견하지 못했습니다. 포맷·JS 문법·diff 공백·문서 로컬 링크 3개를 확인했습니다. 필수 태그 payload·전체 프로파일 의미·v2 요구 조건·렌더링·전체 HWP/HWPX 문서 검증은 여전히 미완료입니다.
