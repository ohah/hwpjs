# 공통 개체의 선택적 꼬리 원값

`hwp5/body/object_common.zig`의 `Properties.extraU16()`은 이미 파싱한 `extra`가 정확히2바이트일 때만 little-endian u16을 반환합니다. 부재·1바이트·3바이트 이상은 null이며0으로 대체하지 않습니다. 원본 extra를 소비하거나 변경하지 않습니다.

이 조회는 꼬리 값의 의미·버전별 기본값·패딩 여부를 판단하지 않습니다. 원본 해석과 관측 프로필 적용은 분리하며, 이 메서드 추가만으로 표/도형의 새 배치나 공개 WASM 조회 지원을 주장하지 않습니다.

같은 모듈의 테스트는 길이0~4, 전체 u16 값65536개, 원본 꼬리 불변성을 확인합니다. 포함한 제품 후보의 ReleaseSafe 빌드와 Native 전체 검증에 더해, 게시 전 HEAD 소스 사본에 이 변경만 적용한 집중 테스트를 별도로 실행합니다.


## 공통 크기 보호의 표 기하 전달

공식 [HWP5 revision 1.3 표70](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)의 bit20은 세로 위치 기준이 문단일 때 크기 보호를 뜻합니다. Native 공통 `Properties`는 원본 flags를 보존하고 기존 `sizeProtected()`가 조건을 해석합니다. 표시 계층은 기존 공통 `hwp5ObjectFlags().size_protected`를 재사용하며 표 기하 결과의 최상위에 그대로 전달합니다. 그리기 기하와 같은 위치이고 별도 해석 규칙을 추가하지 않습니다.

성공한 표 기하는 항상 불리언을 가집니다. `false`는 유효한 원값에서 기존 공통 조건이 비활성이라는 뜻이며 부재·미확인 값을 임의로 false 처리하지 않습니다. 잘못된 source·알려지지 않은 flags·허용되지 않은 확장은 기존 오류를 유지하고 성공 DTO를 만들지 않습니다. 원raw·꼬리 관측 정책·배치 수치는 변경하지 않으며 추가 전달 비용은 객체당 O(1)입니다.

`table2`와 `table-position` HWP/HWPX 짝의 동일 객체 ID 15개에서 독립 CFB 레코드/XML 관측으로 기록한 실제 raw flags를 재사용했습니다. 후속 비교는 이 원값으로 만든 합성 source DTO의 비대상 기하 동일성 검사입니다. 전체 실제 Native DTO 추출이나 저장 검증이 아닙니다. 실제 보호 활성 fixture는 0개이며, 보호 true는 세로 기준 3종과 bit20 활성/비활성의 6조합 합성 입력으로만 검사했습니다. 알려지지 않은 플래그·확장 거부와 입력 불변도 전용 시험에서 확인합니다.

명시 회귀 명령은 `node --test tests/hwp5/object-size-protection-flags.test.mjs tests/hwp5/table-size-protection-geometry.test.mjs`입니다. 이는 의미 필드의 표 기하 전달 누락 보완이며 리사이즈 명령의 보호 강제·UI 기능·producer·브라우저·저장 재열기나 전체 조판 완료를 뜻하지 않습니다.
