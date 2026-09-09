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

일반 컨테이너 보고서(mode 25)의 마지막 decoded bytes/uninspected streams 위치는 `tests/hwp5/container-report-wire.mjs`가 소유합니다. 선택적 추가 보고서를 붙이기 전의 기본 보고서에만 적용하며, 제품 serializer에서 기대 위치를 생성하지 않습니다.

`zig build line-cache-audit`는 변경 추적 병합 문단의 읽기 전용 실파일 조사와 조사 도구의 적대적 테스트를 실행합니다. 전체 `audit`에도 포함됩니다. 해석 범위와 실측은 [병합 줄 캐시 조사](hwp5-merged-line-cache.md)가 소유합니다.

`zig build history-xml-audit`는 별도 설치된 `xmllint`가 PATH에 있을 때 이력의 읽기 전용 XML 조사를 실행합니다. 자동 설치하거나 제품/WASM에 링크하지 않습니다. 외부 도구가 필요 없는 안전 경계 단위 테스트만 기본 `audit`에 포함하며, 실제 XML 조사는 명시적으로 실행합니다. 계약과 실측은 [이력 XML 조사](hwp5-history-xml-evidence.md)가 소유합니다.

## 세 빌드 모드 회귀 검증

ICC 식별자 스냅샷의 생성 파일 일치는 `node tools/icc-registry/generate.mjs --check`, 추출·다운로드·스냅샷·생성 테스트는 `zig build icc-registry-audit --summary all`로 오프라인 검사합니다. 정규 audit에도 포함되며 자동 다운로드/갱신하지 않습니다. 원본 JSON 변경 후 생성기 stdout을 검토해 data.zig에 반영합니다. 계약은 [ICC 등록부 조회](icc-registry-lookup.md)에 둡니다.

언어 태그 등록 테이블은 `node tools/language-registry.mjs --check`로 오프라인 일치를 검사합니다. `--fetch`는 공식 IANA 원본으로부터 축약 JSON을, `--tables`는 로컬 source.json으로부터 파생 파일 내용을 JSON으로 표준 출력합니다. 두 명령 모두 파일을 자동 덮어쓰지 않습니다. 갱신 시 source.json과 파생 파일을 함께 검토·반영하고 전체 audit를 실행합니다. 계약은 [BCP 47 등록 검증](bcp47-registry.md)을 참고합니다.

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.

ReleaseFast의 누수 검증을 std.testing.allocator의 기본 안전 검사에만 의존하지 않습니다. 특히 기대한 파싱/검증 오류를 잡아 성공으로 반환하는 테스트는 OOM 주입 검사와 별도로 정상 할당 후 오류 경로의 해제량을 확인합니다. 명시적 할당 회계 또는 safety=true인 검사 할당자를 사용하며, 실제로 해제 코드를 제거한 변형이 각 모드에서 실패하는지 확인합니다. Zig 0.16에서 확인한 재현과 보강 근거는 [BMP 적대적 검증](bmp-pixels.md)에 둡니다.

WASM 거부 테스트는 임의 예외나 메시지만으로 성공을 판정하지 않습니다. 파서가 반환한 정상 오류의 종류와 기대 오류명을 확인하고, WebAssembly.RuntimeError 및 호스트 TypeError/RangeError는 테스트 실패로 남깁니다. 독립 oracle도 의도한 검증 실패와 자체 실행 오류를 구분합니다. 실제 trap 주입이 거부 통계에 숨었던 재현과 방어 검사는 [BMP RLE 검증](bmp-rle.md)을 참고합니다.
