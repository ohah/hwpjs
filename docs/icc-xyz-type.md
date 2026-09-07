# ICC XYZType 원시 배열

## 계약

[ICC.1:2022 §10.31, Table 85](https://www.color.org/specifications/ICC.1-2022-05.pdf)에 따라 `src/image/icc/xyz_type.zig`가 XYZType 데이터를 읽습니다. `parse`는 정확한 `XYZ ` 타입과 공통 예약 필드, 12바이트 배열 요소 경계를 검사합니다. `Array.at`은 세 개의 signed s15Fixed16 원형을 i32로 반환합니다. 음수·최대/최소값을 잘라내거나 부동소수점으로 보정하지 않습니다.

반환 배열은 입력을 빌립니다. 입력 수명과 변경 관리는 호출자 책임이며 할당·파일 접근은 없습니다. 인덱스를 요소 수와 먼저 비교하므로 최대 usize 입력도 곱셈 전에 거부합니다. 공통 8바이트 접두사는 `type_prefix.zig`가 단독 소유하고 구조 파서 `tag.zig`도 재사용합니다.

빈 배열은 이 원시 계층에서 표현 가능합니다. 특정 태그에 필요한 XYZ 요소 수, 백색점 값, 색상 변환의 의미는 별도 태그 검사 책임입니다. 원시 파서 성공을 mediaWhitePoint나 행렬 열의 유효성으로 취급하지 않습니다. 프로파일 종류별 필수 태그와 제품 PNG 연결은 아직 미완료입니다.

추가로 [ICC.1:2001-04 §6.5.26, Table 78](https://www.color.org/specification/ICC.1-2001-04.pdf)을 대조했습니다. 원시 배치는 같지만 v2의 XYZ 값은 음수가 아니어야 합니다. `xyz_values.validateV2_2001`은 원시 배열을 변경하지 않고 이 조건만 검사합니다. v4나 다른 판본으로 소급하지 않습니다. 헤더 없이 호출하는 명시적 검사이며 판본 선택·태그별 조건 검증은 상위 계층 책임입니다.

## 검증 기록

2026-09-07 `zig fmt --check src`와 `zig build test --summary all`이 통과했습니다(5/5 단계, 네이티브 424/424). 신규 테스트는 서로 다른 두 XYZ 요소의 signed 경계·엔디언·입력 공유, 최대 인덱스, 길이 0–57의 모든 나머지, 접두사 각 바이트 변형과 복구를 검사합니다. 공통 접두사 추출 뒤 기존 태그 구조 테스트도 통과했습니다.

위 424개 결과 이후 v2의 음수 위치별 검사를 추가했습니다. 테스트용 WASM mode 150은 원시 XYZ를 signed little-endian 배열로 반환하고, mode 151은 v2 음수 금지 검사도 수행합니다. 독립 JS 테스트는 원래 정수 배열에서 기대 바이트를 만들며 1–256개 요소의 결정적 변형, 각 접두사 비트 손상, 길이·한도·복구와 v2 허용/거부를 대조합니다. 신규 WASM을 직접 실행한 독립 테스트는 비교 268건·거부 370건으로 통과했습니다. 정규 감사에도 연결했습니다.

초기 Debug 전체 감사는 `/tmp/hwpjs-icc-xyz-Debug.log`에서 종료 코드 0으로 완료됐습니다. WASM/v2 추가 전 실행이므로 최종 검증이 아닙니다. 추가 후 Debug·ReleaseSafe·ReleaseFast 최종 감사가 모두 종료 코드 0, 20/20 단계, 네이티브 425/425, HWP 감사 검사 4,413,692건, WASM import 0으로 통과했습니다. XYZ 비교 268건·거부 370건도 세 모드 모두 확인했습니다. 최종 로그는 로컬 `/tmp/hwpjs-icc-xyz-Debug-final.log`, `/tmp/hwpjs-icc-xyz-ReleaseSafe-final.log`, `/tmp/hwpjs-icc-xyz-ReleaseFast-final.log`입니다. 검사 건수는 변형·반복을 포함하며 실제 문서 수나 지원률이 아닙니다.

코드 재검토에서 접두사 규칙의 단일 소유자, 빌린 입력의 수명, 인덱스 검사 전 곱셈 부재, 원시 signed 값과 v2 제약의 분리를 확인했습니다. 추가 결함은 발견하지 못했지만 전체 태그 의미 검증 완료를 뜻하지 않습니다. 변경 Zig 포맷·JS 문법·관련 문서 로컬 링크 검사도 통과했습니다.

## 공식 실프로파일 수동 대조

공식 RGB 등록부의 [sRGB2014](https://registry.color.org/rgb-registry/profiles/sRGB2014.icc), [v4 preference](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference.icc), [v4 displayclass](https://registry.color.org/rgb-registry/profiles/sRGB_v4_ICC_preference_displayclass.icc)를 메모리로 읽었습니다. Node의 big-endian 정수 읽기로 각 XYZ 태그의 기대값을 독립 구성하여 mode 150 결과와 대조했습니다. 각각 6·1·1개 XYZ 태그가 일치했으며 v2 파일의 6개는 mode 151도 통과했습니다. 다운로드 파일이나 인증 정보는 저장하지 않았습니다. 수동 검사는 정규 감사 건수에 합산하지 않으며, 전체 프로파일 의미나 색상 렌더링 동일성을 증명하지 않습니다.
