# 검증된 Native 모듈 프로필

`packages/core/src/internal/native-module-profiles.ts`가 알려진 WASM 콘텐츠 SHA와 owner-window 투영 선호를 함께 관리합니다. 이전 두 목록의 공통 SHA를 하나로 모으고 과거의 known-only 두 프로필과 owner-window 프로필 구분을 유지합니다. Map 조회이며 요청마다 목록 전체를 다시 순회하지 않습니다.

모듈 등록 권위는 `wasm-module-loader.ts`의 private WeakMap입니다. 로더가 소유 사본의 실제 SHA를 계산해 명시 목록과 일치하는 모듈을 컴파일했을 때만 등록합니다. 사용자 환경변수, ABI 함수 존재, URL, 메타데이터 객체 조회나 호출자가 직접 컴파일한 모듈은 등록 권위가 아닙니다. `native-runtime-origin.ts`는 이 프로필의 투영 선호만 재사용하며 별도로 모듈을 등록하지 않습니다. 알려지지 않은 모듈은 기존 일반 경로를 유지합니다.

새 공개 엔진 `fee47642df3a3626d3b37662e13d4130b02f44e1b86843b207ab6d64b99f3ab6`을 갱신하면서 CI의 원본 표 검사에서 로더의 known 지문 부재를 발견했습니다. 선언된 테스트 SHA와 실제 바이트는 일치했지만 private WeakMap에는 등록되지 않아 검사 시작 전에 차단된 것입니다. 기대 SHA를 바꾸는 것만으로 등록을 허용하지 않았습니다.

새 지문을 통제 후보에 등록한 뒤 실제 Native의 원본 셀 테두리·채움·대각선, 증분 텍스트의 fresh full 대조, Worker COW·이력과 공개 Worker의 unknown/registered 분기를 검사했습니다. 프로필·입력 사본 소유권 검사도 포함했습니다. 테스트 준비 중 CFB 독립 오라클 부재/허용 fixture 경로 차이로 실패한 실행과 최종 실제 경로 검사를 구분합니다. 근거는 `zig-out/verification/created-table-ui-r1/registered-native-regression-r2.log`, `registered-cell-runtime-final.log`, `registered-public-worker-final.log`입니다. 새 엔진의 전체 문서·조판 동치를 인증한 것은 아닙니다.

빌드한 공개 정적 후보에서 실제 표 편집과 이력을 다시 검사합니다. 프로필 등록과 별개인 CLI fixture 기대 SHA는 [개발 명령](development-commands.md)의 공개 manifest 계약을 사용하며, CI 환경값은 검증된 모듈 지문 목록에 대한 쓰기 통로가 아닙니다.
