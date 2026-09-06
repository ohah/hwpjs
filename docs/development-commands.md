# 개발·검증 명령

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

## 세 빌드 모드 회귀 검증

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.
