# ICC XYZ 태그별 검사

## 근거와 범위

[ICC.1:2022](https://www.color.org/specifications/ICC.1-2022-05.pdf)의 §9.2.4, §9.2.31, §9.2.33, §9.2.36, §9.2.46에 정의된 rXYZ·gXYZ·bXYZ·lumi·wtpt를 다룹니다. 본문의 일부 교차 참조 번호가 실제 절 제목과 어긋나므로 이름·시그니처·실제 정의를 함께 확인했습니다. 일반 XYZType은 배열이지만 이 태그들은 각각 행렬의 한 열, 휘도 또는 백색점 하나를 나타냅니다.

`xyz_tag.parse(signature, payload)`는 알려진 다섯 이름을 구분하고 기존 원시 XYZ 파서로 타입·예약 필드·배열 경계를 검사한 뒤 요소 수가 1인지 검사합니다. 값은 소유하는 세 i32로 반환합니다. 알 수 없는 이름은 null로 반환하며, 이는 검증 성공이 아니라 미처리입니다. v2의 bkpt도 현재 이 함수의 대상이 아닙니다. 테이블 패딩은 payload에 포함하지 않습니다.

`xyz_tag_values.inspectV4(class, value)`는 명시적으로 선택한 2022 판본의 추가 규칙입니다. display의 wtpt는 §9.2.36이 지정하는 PCS illuminant 값을 기존 `pcs_illuminant.validateV4`로 검사합니다. D50 상수나 반올림을 복제하지 않습니다. 나머지 문맥 의존 검사는 context_deferred로 남깁니다. lumi의 X/Z 비영 값은 §9.2.33의 NOTE에 따른 별도 진단이며 강제 오류나 값 보정으로 바꾸지 않습니다.

헤더 판본 선택·필수 태그 존재·v2 음수 제약 조립·행렬과 TRC의 상호 관계·백색 적응의 측정 근거·제품 PNG 연결은 이 단계에서 검사하지 않습니다. 특히 display 백색점 검사 성공은 전체 프로파일 의미 검증 완료가 아닙니다.

## 검증

공식 RGB 등록부의 [v4 preference](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference.icc)와 [v4 displayclass](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference_displayclass.icc)를 메모리로 읽고 실제 헤더 클래스를 사용해 mode 152를 실행했습니다. 각각 spac·mntr이며 대상 wtpt 태그가 각 1개였습니다. 원시 정수와 진단을 독립 JS 기대값과 대조해 일치했고 display의 D50 조건도 별도 BigInt 구간 비교로 확인했습니다. v2 파일에 v4 정책을 적용하지 않았습니다. 파일 전체의 유효성이나 색상 출력 대조가 아니며 이 수동 결과는 자동 감사 수에 더하지 않습니다.

최신 실행: mode 152를 포함한 최종 Debug·ReleaseSafe·ReleaseFast 전체 감사가 모두 종료 코드 0, 20/20 단계, 네이티브 427/427, 감사 검사 4,414,057건으로 통과했습니다. 신규 비교 127건·예상 오류 거부 238건도 세 모드 모두 확인했습니다. 최종 로그는 로컬 `/tmp/hwpjs-icc-xyz-tags-Debug-final.log`, `/tmp/hwpjs-icc-xyz-tags-ReleaseSafe-final.log`, `/tmp/hwpjs-icc-xyz-tags-ReleaseFast-final.log`입니다. 검사 건수는 변형·반복을 포함하며 문서 수나 포맷 지원률이 아닙니다.

재검토에서 원시 XYZ 파서·태그 요소 수·클래스별 값 규칙의 책임 분리와 D50 규칙 재사용을 확인했습니다. 미지원 null과 문맥 보류가 전체 유효성으로 승격되지 않으며 추가 결함은 발견하지 못했습니다. 포맷·JS 문법·diff 공백 검사도 통과했습니다.

신규 네이티브 테스트는 다섯 이름별 0/1/2개 요소, 잘림, 타입·예약 필드 변형, 미지원 이름과 빈 입력을 검사합니다. display 백색점의 각 축 실패, 다른 클래스와 다른 태그에서 D50 규칙을 잘못 적용하지 않는지도 검사합니다.

2026-09-07 `zig fmt --check src`와 `zig build test --summary all`이 통과했습니다(5/5 단계, 네이티브 427/427). 초기 `/tmp/hwpjs-icc-xyz-tags-Debug.log` 감사도 종료 코드 0으로 완료됐지만 mode 152 추가 전 실행이므로 최종 검증은 위 기록을 따릅니다. 전체 태그별 의미 검사가 완료된 상태는 아닙니다.

후속 테스트 mode 152는 클래스 시그니처·태그 시그니처·payload를 받아 처리 여부·태그 종류·XYZ 값·진단 플래그를 반환합니다. 클래스 해석은 기존 공개 헤더 검사기를 사용합니다. 미지원 태그는 처리 여부 0이며 성공한 알려진 태그와 구분합니다. `tests/hwp5/icc-xyz-tags.mjs`는 7개 클래스와 5개 태그, D50 각 축 주변 25개 값, 타입·예약 필드·요소 수·잘림·한도·미지원 이름·복구를 대조합니다. 반올림 기대값은 제품 함수와 다른 BigInt 정수 구간 비교로 구성했으며 정규 감사에 연결했습니다.
