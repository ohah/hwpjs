# hwpjs 개발 가이드

## 프로젝트

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig 0.16.0 / WebAssembly 라이브러리입니다.
현재는 바이트 리더와 CFB 컨테이너 읽기가 구현되어 있습니다. HWP/HWPX 문서 파싱·편집·저장은 미구현입니다. 지원 범위는 구현·테스트로 확인하고, 예정 기능을 완료된 기능처럼 설명하지 않습니다.

## 구조와 참고 자료

- `src/binary/`: 경계 검사와 바이너리 읽기.
- `src/cfb/`: 헤더·섹터·할당 테이블·디렉터리·스트림·검색을 파일별로 분리한 CFB 리더.
- `src/wasm/`, `js/`: WASM 메모리·문서 수명·엔트리 변환별 어댑터.
- ABI 필드·버전은 `js/abi-schema.mjs`에서 정의합니다. `tools/generate-abi.mjs`의 Zig 출력과 일치해야 하며 빌드에서 검사합니다. 검색 규칙은 `src/cfb/find.zig`에만 둡니다.
- `src/root.zig`: Zig 라이브러리 진입점.
- `src/wasm.zig`: 브라우저용 WASM ABI 진입점.
- `build.zig`: 빌드·테스트 정의.
- `docs/architecture.md`: 모듈 책임과 구현 순서.
- `legacy/rust/`: 이전 구현·fixture·명세. 요청된 비교나 수정에만 사용합니다.
- `reference/`: 외부 참고 소스. 제품 의존성으로 자동 포함하지 않습니다.

HWP5 구현 시 `legacy/rust/documents/docs/spec/hwp-5.0.md`와 `legacy/rust/.claude/skills/hwp-spec/`의 해당 파트를 확인합니다. 레거시 설계·개발 규칙을 신규 Zig 코드에 그대로 적용하지 않습니다.

## 구현 원칙

- CFB 컨테이너, HWP5 레코드, HWPX ZIP/XML, 문서 모델, WASM ABI의 책임을 분리합니다.
- 코어는 메모리 기반으로 설계합니다. 파일시스템·시계·브라우저 API 의존성은 경계에서 주입합니다.
- 할당자와 버퍼 소유권·수명을 명확히 하고, 실패 경로에서도 메모리를 정리합니다.
- 외부 입력의 크기·오프셋·오버플로·순환 참조를 검사하고, 예상 가능한 입력 오류는 오류 값으로 반환합니다.
- 버전별 필드 부재와 기본값을 구분합니다. 미지원 레코드·스트림의 보존 또는 손실 여부를 명시합니다.
- 저장은 새 컨테이너 생성부터 구현합니다. 무손실 저장 주장은 독립 구현과의 비교로 검증합니다.
- GPL/LGPL 의존성은 제외합니다. 외부 코드를 채택·이식하기 전에 라이선스를 확인합니다.

## 검증

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

## 작업과 커밋

- 한국어로 변경 결과와 남은 제한을 간결하게 설명합니다.
- 기존 사용자 변경을 보존하고, 무관한 변경은 커밋에 포함하지 않습니다.
- 검증 후 별도 브랜치·PR 없이 `main`에 직접 커밋·푸시합니다.
- 푸시 전 원격 변경을 확인하며, 강제 푸시나 스냅샷 일괄 승인은 하지 않습니다.
- 커밋 메시지는 `commit-rules.md`를 따릅니다.
