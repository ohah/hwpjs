# 파일·폴더 구조

## 프로젝트와 현재 범위

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig 0.16.0 / WebAssembly 라이브러리입니다.
현재는 바이트 리더, CFB v3/v4 읽기·strict 검증·새 컨테이너 생성/재저장, HWP5 헤더·압축 스트림·레코드 경계와 DocInfo 주요 리소스 해석·활성 참조 검증, 본문 문단 헤더·UTF-16 텍스트/제어문자 토큰 코어가 구현되어 있습니다. HWP/HWPX 전체 문서 모델·레이아웃·본문 편집·저장은 미구현입니다. HWP5 코어는 테스트용 WASM에서 검증하며 제품 JS 공개 API는 아직 CFB만 제공합니다. 지원 범위는 구현·테스트로 확인하고, 예정 기능을 완료된 기능처럼 설명하지 않습니다.

## 진입점과 공통 계층

- `src/binary/`: 경계 검사와 바이너리 읽기.
- `src/cfb/`: 읽기·검증·저장을 책임별로 분리한 CFB 코어.
- `src/hwp5/`: 헤더 원본·버전·스트림 정책·압축 trailer·레코드 framing을 분리합니다. [구현/검증 기록](hwp5-foundation.md)을 참조합니다.
- `src/compression/`: bounded raw DEFLATE와 MIT Zig 디코더 로컬 수정본. HWP 플래그·trailer 정책을 넣지 않습니다.
- `src/wasm/`, `js/`: WASM 메모리·문서 수명·엔트리 변환별 어댑터.
- ABI 필드·버전·편집 모델 wire 형식은 `js/abi-schema.mjs`에서 정의합니다. 생성된 Zig 선언과 일치해야 하며 빌드에서 검사합니다. 레거시 검색은 `find.zig`, 명세 이름 비교·정렬·검색은 `name_order.zig`, 읽기/쓰기 공통 메타데이터 규칙은 `entry_rules.zig`에 둡니다.
- `src/root.zig`: Zig 라이브러리 진입점.
- `src/wasm.zig`: 브라우저용 WASM ABI 진입점.
- `build.zig`: 빌드·테스트 정의.
- `docs/architecture.md`: 모듈 책임과 구현 순서.
- `legacy/rust/`: 이전 구현·fixture·명세. 요청된 비교나 수정에만 사용합니다.
- `reference/`: 외부 참고 소스. 제품 의존성으로 자동 포함하지 않습니다.

## 상세 문서

- [HWP5 모듈 계약](hwp5-modules.md)
- [아키텍처와 구현 순서](architecture.md)
- [프로젝트 규칙](project-rules.md)
- [개발·검증 명령](development-commands.md)
