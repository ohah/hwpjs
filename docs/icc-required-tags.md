# ICC 필수 태그 검증 작업

## 2026-09-27 현재 내용 재검증

[ICC.1:2022 §8.2–8.9](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 공통/DeviceLink 예외, 입력·디스플레이·출력 모델별 요구, xCLR의 입력/출력 colorantTable 조건과 현재 `required_plan`·`required_presence`·`required_table`을 다시 대조했습니다. 현재는 **명시적으로 선택한 v4_2022 표의 필수 태그 이름 집합과 누락 집합**을 검사합니다. `required_table`은 파싱된 헤더에서 클래스·색공간을 얻고 판본·모델·측정 백색 근거는 호출자가 명시합니다. 판본 major 일치는 확인하지만 모든 minor/bugfix에 같은 요구가 적용된다는 인증은 아닙니다. v2 필수 집합은 거부하며, 성공해도 payload·계산 모델과 백색 조건 unknown은 보류합니다. 별도 `payload_inspection`과 matrix/TRC 계층의 부분 구현을 이 존재 검사 하나의 전체 유효성 판정으로 합치지 않습니다.

Debug·ReleaseSafe·ReleaseFast에서 `required v4 obligations`·`required xCLR input`·`presence never certifies`·`required table derives`·`PNG required selection` 필터는 각 모드 각각 root 포함 2/2 통과했습니다. 기존 로컬 WASM probe를 **재빌드하지 않고** mode 163 독립 이름 집합 대조 623비교·51거부와 mode 240 PNG 선택형 연결 265비교·141거부를 재실행해 일치했습니다. [공식 v4 sRGB 두 파일](https://registry.color.org/rgb-registry/srgbprofiles)의 헤더/태그 이름을 메모리로 다시 읽어 ColorSpace/single과 Display/LUT를 **명시적으로 선택**했을 때 각각 9개 원본 태그 중 요구 5개·누락 0개였고, 두 결과 모두 백색 조건·payload·계산 모델 보류 플래그는 유지됐습니다. 모델/백색을 파일 바이트만으로 자동 확정하거나 payload를 검사한 실파일 결과가 아닙니다. 과거 세 모드 전체 audit와 macOS 프로파일 6개·실제 PNG 삽입 파일은 이번에 재실행하지 않았습니다.

## 2026-09-07~08 최초 조사와 단계 기록

2026-09-08 후속 [ICC 2022 필수 태그 존재 검사](icc-required-presence.md)를 구현·검증하기 시작했습니다. 아래 최초 조사와 달리 이름 집합의 누락 검사가 추가되었으며, 현재 범위는 상단 재검증 구획과 해당 계약 문서가 소유합니다.

2026-09-07 [ICC.1:2022 공식 명세](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 §8.1–8.8과 당시 `src/image/icc/tag_table.zig`를 대조했습니다. 당시 태그 경계·중복·배치는 검사했지만 프로파일별 필수 태그 집합은 검사하지 않았습니다. 등록부 조회 성공만으로 이 누락을 해소할 수 없다는 점이 후속 구현의 근거였습니다.

## 명세상 구분할 조건

- §8.2의 공통 태그와 DeviceLink 예외를 분리합니다. chromaticAdaptation의 조건은 측정에 사용한 백색에 의존하므로 헤더만으로 조건 충족/불충족을 추정하지 않습니다. 외부 근거가 없으면 미확정으로 남깁니다.
- 입력·디스플레이의 LUT, 행렬/TRC, 단색 모델은 서로 다른 필수 집합입니다. 태그 하나가 있다는 이유로 다른 모델의 불완전한 집합을 정상으로 승격하지 않습니다. 행렬 모델은 3성분·PCSXYZ 제약도 확인해야 합니다.
- 출력 LUT는 입력 LUT와 필수 집합이 다릅니다. xCLR의 colorantTable 조건은 단순 채널 수로 판별하지 않습니다. CMYK와 4CLR는 모두 4채널이지만 다른 조건입니다.
- DeviceLink는 입력 색공간과 출력용 PCS 필드를 각각 검사하여 colorantTable과 colorantTableOut 조건을 결정합니다. 일반 프로파일의 PCS 제한을 재사용하지 않습니다.
- 태그 존재, 허용 타입, 내부 길이·채널 수, 실제 변환의 유효성은 별도 결과입니다. 알려진 이름에 8바이트짜리 타입 접두사만 붙인 입력이 전체 검증을 통과해서는 안 됩니다.

## 현재 분리된 검사와 남은 범위

[행렬/TRC 모델 조립](icc-matrix-trc-model.md)은 실제 헤더와 6개 모델 태그의 payload를 기존 파서로 연결하는 별도 계층입니다. 과거 세 모드 전체 감사 기록은 해당 문서가 소유하며 이번에 재실행하지 않았습니다. 전체 프로파일 검증·LUT 우선순위는 별도로 남아 있습니다.

[색순응 행렬](icc-chromatic-adaptation.md)은 sf32 원시 배열·chad 요소 수·정확한 비특이 검사를 분리한 계층입니다. 과거 세 모드 전체 감사 기록은 해당 문서가 소유하며 이번에 재실행하지 않았습니다. 실제 백색점 변환과 전체 프로파일 검증은 별도로 남아 있습니다.

공통 desc/cprt payload의 [다국어 문자열 원시 구조](icc-localized-structure.md)와 별도 Unicode·선택 검사도 구현됐습니다. 원시 경계 검사를 모든 locale 의미나 전체 태그 유효성 판정으로 확대하지 않습니다.

타입별 기반 작업은 [XYZType 원시 배열](icc-xyz-type.md)부터 분리했습니다. 원시 배열 검증은 태그별 cardinality나 필수 집합 검사 완료를 의미하지 않습니다.

후속 [XYZ 태그별 검사](icc-xyz-tags.md)는 다섯 태그의 요소 수와 display 백색점 규칙을 담당합니다. 필수 태그 집합과 다른 타입의 검사는 계속 남아 있습니다.

TRC용 [curveType 원시 파서](icc-curve-type.md)는 항등·감마·샘플 배열의 구분과 경계를 담당합니다. 후속 점 평가는 아래 통합 평가 문서에 분리합니다.

[parametricCurveType 원시 파서](icc-parametric-curve.md)는 함수 종류별 파라미터 수·순서·부재를 구분합니다. 수식 평가와 함수 유효성 검사 완료를 의미하지 않습니다.

[TRC 태그별 타입 검사](icc-trc-tags.md)는 네 TRC 이름과 판본별 허용 타입을 연결합니다. [TRC 순방향 평가](icc-trc-forward.md)와 별도 matrix/TRC 모델 조립은 부분 계산 계층이며, 필수 이름 집합·LUT 전체·프로파일 전체 유효성 판정과 혼동하지 않습니다.

§8.9의 NamedColor 필수 이름은 현재 존재 검사에 포함됩니다. §8.10의 변환 선택 우선순위, §9의 태그별 허용 타입, §10의 타입 구조와 Annex F의 모델 제약은 일부 계층만 구현돼 있어 전체 판정으로 묶는 작업이 남아 있습니다. v2는 별도 명세를 읽고 차이를 명시하며 v4.4 규칙을 모든 v4/v2 파일에 소급하지 않습니다.

현재 존재 검사는 구조 파서와 분리돼 있고 클래스·모델·조건별 누락, 이름 순서/중복·미지 태그 반례 및 PNG 선택형 연결을 검사합니다. 공유 데이터·잘못된 타입/채널 수·미지원 태그 보존과 전체 계산 의미는 각각의 소유 계층에서 검증해야 하며, 이 문서의 이름 집합 성공만으로 인증하지 않습니다.
