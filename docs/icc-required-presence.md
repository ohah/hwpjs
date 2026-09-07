# ICC 2022 필수 태그 존재 검사

## 구현 범위와 책임

[ICC.1:2022 §8.2–8.9](https://www.color.org/specifications/ICC.1-2022-05.pdf)에 따라 일곱 클래스의 필수 태그 이름 집합과 누락 집합을 계산합니다. required_tag_set은 이름과 집합 표현, required_plan은 클래스·명시적 모델·색공간·측정 백색 조건, required_presence는 입력 이름 목록과의 차집합을 소유합니다. 기존 태그 바이트/경계 파서는 변경하지 않습니다.

Context는 판본·클래스·색공간·PCS·모델·측정 백색 근거를 명시적으로 받습니다. 현재 판본은 v4_2022만 지원하고 v2_2001을 거부합니다. 실제 헤더와 Context의 일치, 버전 minor와 선택 판본의 적용 정책은 호출자 책임이며 이 함수가 추정하지 않습니다. LUT·matrix·monochrome은 입력/디스플레이/출력에 맞춰 선택하고 단일 모델 클래스에는 single을 사용합니다. 태그 하나만 보고 모델을 추정하거나 유효성을 승격하지 않습니다.

입력 LUT와 디스플레이 LUT의 방향별 요구, 출력 LUT의 세 intent·gamut·xCLR colorantTable, matrix의 여섯 태그와 3성분/PCSXYZ 제약, monochrome의 GRAY/grayTRC를 구분합니다. DeviceLink는 desc·cprt·pseq·A2B0과 입력/출력 xCLR의 clrt/clot를 각각 요구하며 wtpt/chad를 요구하지 않습니다. ColorSpace·Abstract·NamedColor의 요구도 별도로 선택합니다. CMYK와 4CLR를 같은 조건으로 취급하지 않고 matrix 입력을 RGB로만 제한하지 않습니다. Abstract는 PCS 간 모델의 색공간 제약을 확인합니다.

측정 백색이 PCS 백색과 다른지는 외부 근거를 unknown/same/different로 전달합니다. unknown이면 chad가 이미 있어도 조건 미확정으로 보고합니다. different이면 DeviceLink를 제외하고 chad를 요구합니다. 조건 판단 자체와 태그 존재를 혼동하지 않습니다.

반환값은 required·missing과 adaptation_condition_deferred·payloads_deferred·computational_model_deferred입니다. 전체 valid 판정은 제공하지 않습니다. 이름만 받으므로 중복·payload 타입/길이·프로파일 배치·필수 태그의 실질적 데이터·단조성·역함수·행렬·LUT 변환을 검사하지 않습니다. 모든 이름이 있어 missing이 비어도 payload와 계산 모델은 계속 보류합니다. 알 수 없는 이름은 요구 집합에 영향을 주지 않으며, 입력 순서와 중복은 누락 집합에 영향을 주지 않습니다. 중복의 허용 여부를 판정하는 기존 태그 테이블 검사를 대체하지 않습니다.

§8.10의 변환 선택 우선순위는 필수 존재 조건과 별개입니다. 선택적 DToB/BToD 태그가 있다고 필수 AToB/BToA 태그의 누락을 지우지 않습니다. 우선순위 선택기·지원 processing element 검사·payload 연결·v2 차이 검증은 후속 작업입니다.

## 검증 진행

2026-09-08 네이티브 전체 테스트가 5/5 단계, 449/449로 통과했습니다. 신규 3개 테스트는 ReleaseSafe·ReleaseFast 직접 실행에서도 통과했습니다. 클래스별 개수와 조건, CMYK/xCLR 입력·출력 분리, GRAY/Lab 허용, 비RGB 3성분 matrix, 금지 모델·판본, 태그별 누락·의미 보류를 검사합니다.

WASM mode163과 독립 JS의 명시적인 이름 집합 대조를 전체 감사에 연결했습니다. 클래스/모델별 요구 집합을 제품 열거형에서 생성하지 않고 별도로 구성합니다. 빈 목록·각 태그 누락·순서 반전·중복·알 수 없는 이름·잘림·한도·복구를 검사합니다. 테스트 검토에서 누락시킨 desc를 중복 테스트가 다시 넣을 수 있는 편향을 발견해, 남아 있는 태그만 중복시키도록 수정했습니다.

최초 독립 JS 직접 비교 367건·오류 거부 26건 통과 후, DeviceLink의 RGB/CMYK/2CLR…FCLR 입력·출력 256개 조합과 클래스/모델의 금지 조합·probe 판별값 경계를 추가했습니다. 확장된 기준을 같은 Debug WASM에 직접 적용해 비교 623건·오류 거부 51건이 통과했습니다.

실제 macOS v4 프로파일 6개(ACESCG Linear, DCI(P3) RGB, Display P3, ITU-2020, ITU-709, ROMM RGB)의 헤더와 태그 목록을 읽어 디스플레이 matrix 문맥으로 대조했습니다. 원본 목록 6건과 메모리에서 필수 태그/조건부 chad를 하나씩 뺀 60건, 총 66건이 독립 이름 집합·누락 값·보류 플래그와 일치했습니다. chad 제거 시에만 different 근거를 테스트 입력으로 주입했으며 원본의 측정 백색을 추정한 것이 아닙니다. 시스템 파일은 수정·복제하지 않았고 다른 클래스의 실파일 근거나 payload 검증으로 확대하지 않습니다. 수동 검사 수는 자동 감사 수에 더하지 않습니다.

최초 Debug 전체 감사는 `/tmp/hwpjs-icc-required-Debug-first.log`에서 종료 코드 0으로 끝났지만 테스트 편향 수정·확장 전에 시작했으므로 최종 수정본 감사와 구분합니다. 수정본 Debug·ReleaseSafe·ReleaseFast 감사가 각각 종료 코드 0, 20/20 단계, 네이티브 449/449, HWP5 검사 4,765,905건으로 통과했습니다. 신규 비교 623건·오류 거부 51건도 세 모드 모두 포함됩니다. 로그는 `/tmp/hwpjs-icc-required-{Debug,ReleaseSafe,ReleaseFast}-final.log`입니다. 검사 수는 지원율이 아니며 이 단계는 필수 태그의 전체 의미 검증 완료가 아닙니다.

최종 적대적 재검토에서 태그 이름 집합/조건 계획/차집합의 책임 분리, 모든 성공 결과의 payload·계산 모델 보류 유지, 미확정 측정 백색의 비추정, 비할당 반환을 확인했습니다. 공식 §7.2.6–7.2.7과도 대조해 DeviceLink 출력 색공간 예외와 다른 클래스의 PCS 제한을 재확인했습니다. 추가 코드 결함은 발견하지 못했습니다. 포맷·JS 문법·diff 공백 검사도 통과했습니다.
