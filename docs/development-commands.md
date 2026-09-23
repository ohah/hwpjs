# 개발·검증 명령

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

HWPX 전용 테스트는 `zig test src/root.zig --test-filter HWPX`로 실행합니다. ZIP 엔트리·손상 경계·할당 실패와 두 corpus의 패키지 관계·버전 XML·[암호화 분류](hwpx-protection.md), 대표 표본의 [header·spine 구조](hwpx-document-structure.md)와 [header 리소스 ID 색인](hwpx-header-resources.md), [section p/run 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 경로·XML 경계](hwpx-chart-references.md)를 검사합니다. 기존 패키지 테스트 일부가 Git에 추적되지 않는 로컬 `reference/rhwp` 예제를 사용하므로 이 명령과 `zig build test`도 깨끗한 체크아웃에서 그대로 재현되지는 않습니다. 나머지 내부 참조나 공개 JS API 검사는 아닙니다. ZIP 범위는 [HWPX ZIP 컨테이너](hwpx-zip-container.md), 패키지 관계 범위·실측은 [HWPX 패키지 관계 검증](hwpx-package-relationships.md), 버전 필드 변형은 [HWPX 버전 XML 검증](hwpx-version.md)을 참조합니다.

[차트 데이터 캐시 구조](hwpx-chart-cache.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart cache'`로 선택할 수 있습니다. 차트 경로 검사와 결합된 캐시 진단 및 두 차트 간 한도 테스트는 `--test-filter 'HWPX chart'`로 함께 확인합니다.

[차트 수식 참조 구조](hwpx-chart-formula.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart formula'`로 선택합니다. 경로와의 통합 테스트는 `--test-filter 'HWPX chart'`에 포함됩니다.

[차트 값·수식 텍스트 관측](hwpx-chart-text.md)의 공통 XML 이벤트 테스트는 `zig test src/root.zig --test-filter 'XML content visitor'`, 차트의 텍스트 한도·집계는 `zig test src/root.zig --test-filter 'HWPX chart'`로 확인합니다. 선택 실파일 제품 조사와 독립 대조는 각각 아래 `hwpx_structure_survey.zig`의 차트 필터와 `python3 tools/hwpx-chart-text-oracle.py`를 실행합니다. Python oracle은 제품·기본 audit 의존성이 아닙니다.

[차트 ST_Xstring](hwpx-xstring.md)의 해독기 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX Xstring'`, 차트 통합 테스트는 위 `HWPX chart` 필터로 실행합니다. corpus에는 해당 이스케이프가 없으므로 독립 oracle의 원문 값 길이 대조를 해독 정확성의 증거로 사용하지 않습니다.

[HWPX section 텍스트·내부 요소 이벤트](hwpx-section-text.md)는 `zig test src/root.zig --test-filter 'HWPX section text'`로 합성·오류 경계를 검사합니다. 선택 실파일 제품 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus section text and inline token read-only survey'`, 직접 run이 없는 실파일 회귀 검사는 같은 명령의 필터를 `HWPX layout-only paragraph keeps its real section diagnostic`으로 바꿔 실행합니다. 독립 대조는 `python3 tools/hwpx-section-text-oracle.py`로 실행합니다. 이 선택 검사들은 Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWPX section 원문·요소 인덱스](hwpx-section-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX section tree'`로 실행합니다. 선택 실파일 조사는 `HWPX corpus section tree shard 0`부터 `shard 7`까지의 이름을 각각 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. 한 프로세스에서 전 shard를 실행하면 메모리 압박으로 종료될 수 있습니다. 이 조사는 위와 같은 로컬 corpus가 필요하며 기본 audit에는 포함되지 않습니다. 독립 요소 수와 shard별 기대값은 `python3 tools/hwpx-section-text-oracle.py`의 `section_elements`·`section_tree_shards`와 대조합니다.

전체 corpus의 header/section XML 문법·namespace, 제품 header·spine 구조, header 리소스 ID 색인, section 및 header 서식 참조, 언어별 글꼴·번호·글머리표·이진 리소스·차트 경로 연결 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast`로 명시적으로 실행합니다. 이 선택 조사는 Git에 추적되지 않는 로컬 `reference/rhwp` 클론이 있어야 재현됩니다. 수백 MB의 해제 XML을 읽으므로 기본 `zig build test`·`audit`에는 포함하지 않습니다. 묶음 실행은 큰 메모리 사용량으로 중단될 수 있어 `--test-filter 'HWPX corpus chart path and XML read-only survey'`처럼 corpus 항목별 단독 실행 결과를 구분해 기록합니다. 원본은 변경하지 않으며 선행 XML 관측은 [HWPX XML 구조 조사](hwpx-xml-structure-evidence.md), 제품 구조 검증 결과는 [header·spine 구조](hwpx-document-structure.md), ID 색인 결과는 [header 리소스](hwpx-header-resources.md), 참조 결과는 [section 서식 참조](hwpx-section-references.md)·[header 내부 참조](hwpx-header-references.md)·[글꼴 ID 참조](hwpx-font-references.md)·[번호·글머리표 참조](hwpx-list-references.md)·[이진 리소스 연결](hwpx-binary-references.md)·[차트 경로 검증](hwpx-chart-references.md)이 각각 소유합니다.

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

일반 컨테이너 보고서(mode 25)의 마지막 decoded bytes/uninspected streams 위치는 `tests/hwp5/container-report-wire.mjs`가 소유합니다. 선택적 추가 보고서를 붙이기 전의 기본 보고서에만 적용하며, 제품 serializer에서 기대 위치를 생성하지 않습니다.

`zig build line-cache-audit`는 변경 추적 병합 문단의 읽기 전용 실파일 조사와 조사 도구의 적대적 테스트를 실행합니다. 전체 `audit`에도 포함됩니다. 해석 범위와 실측은 [병합 줄 캐시 조사](hwp5-merged-line-cache.md)가 소유합니다.

`zig build history-xml-audit`는 별도 설치된 `xmllint`가 PATH에 있을 때 이력의 읽기 전용 XML 조사를 실행합니다. 자동 설치하거나 제품/WASM에 링크하지 않습니다. 외부 도구가 필요 없는 안전 경계 단위 테스트만 기본 `audit`에 포함하며, 실제 XML 조사는 명시적으로 실행합니다. 계약과 실측은 [이력 XML 조사](hwp5-history-xml-evidence.md)가 소유합니다.

## PrvImage 조사

`zig build preview-image-audit --summary all`은 제품 WASM 빌드 후 조사 도구 테스트와 기본 HWP fixture의 읽기 전용 시그니처 조사를 실행하며 정규 audit에도 포함됩니다. 제품 이미지 검사 명령이 아닙니다. 범위를 넓히려면 빌드 후 아래 명령에 디렉터리를 명시합니다. 직접 자식 파일만 조사합니다. 계약·미구현 범위는 [PrvImage 형식 조사](hwp5-preview-image-evidence.md)에 둡니다.

`zig build doc-options-audit --summary all`은 DocOptions 관측 테스트와 기본 corpus 조사를 실행합니다. 확장 조사는 `node tests/hwp5/doc-options-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. 직접 자식 HWP 파일만 읽으며 내부 문서 경로는 출력하지 않습니다. 필드 검증과의 경계는 [DocOptions 조사](hwp5-doc-options-evidence.md)에 둡니다.

```sh
node tests/hwp5/preview-image-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples
```

## 차트 Contents 관측

제품 WASM 빌드 후 루트에서 `node --test tests/hwp5/chart-contents-evidence.test.mjs`와 `node tests/hwp5/chart-contents-survey.mjs`를 실행합니다. 조사 범위와 의미 해석의 경계는 [차트 Contents 실측](hwp5-chart-contents-evidence.md)에 둡니다. 정규 audit와 별개의 읽기 전용 조사입니다.

`zig build chart-ownership-audit --summary all`은 SHA-256으로 고정한 실제 Contents 표본의 소유권·원본 복제·span patch·String 정의 편집·참조 분리/재파싱·OOM·모든 잘림·한도 오류 검사와 표본 모듈 생성기 테스트를 실행합니다. `-Doptimize=ReleaseSafe` 또는 `-Doptimize=ReleaseFast`로 같은 검사를 실행할 수 있으며 정규 `audit`에도 포함됩니다. 매 실행마다 기존 corpus에서 원본을 다시 확인하고 생성한 Zig 모듈은 빌드 캐시에만 둡니다. 필요한 표본이 없으면 다른 표본으로 대체하지 않고 실패합니다. 선택 배치와 검증 한계는 [Contents 조립](hwp5-chart-observed-contents.md), 원본 출력 계약은 [차트 원본 바이트 보존](hwp5-chart-source-preservation.md), patch 계약은 [차트 원본 span patch writer](hwp5-chart-patch-writer.md), 정의 편집 계약은 [차트 String 객체 편집](hwp5-chart-string-edit.md), 참조 분리 계약은 [차트 String 참조 분리](hwp5-chart-string-fork.md)가 소유합니다.

## 세 빌드 모드 회귀 검증

GIF의 macOS ImageIO 제3 구현 대조는 선택적 테스트이며 정규 audit나 제품 빌드에 Swift/CoreGraphics 의존성을 추가하지 않습니다. `swiftc tests/hwp5/gif-imageio-oracle.swift -O -o /tmp/hwpjs-gif-imageio-oracle`로 oracle을 빌드할 수 있습니다. stdin으로 GIF를 받고 프레임 RGBA JSON을 출력하며, `tests/hwp5/gif-imageio.mjs`의 compareGifImageIo가 단일 프레임/팔레트/크기 전제를 확인한 뒤 픽셀을 대조합니다. 대상과 결과는 [GIF 복호화 기록](gif-indexed.md)에 둡니다.

ICC 식별자 스냅샷의 생성 파일 일치는 `node tools/icc-registry/generate.mjs --check`, 추출·다운로드·스냅샷·생성 테스트는 `zig build icc-registry-audit --summary all`로 오프라인 검사합니다. 정규 audit에도 포함되며 자동 다운로드/갱신하지 않습니다. 원본 JSON 변경 후 생성기 stdout을 검토해 data.zig에 반영합니다. 계약은 [ICC 등록부 조회](icc-registry-lookup.md)에 둡니다.

언어 태그 등록 테이블은 `node tools/language-registry.mjs --check`로 오프라인 일치를 검사합니다. `--fetch`는 공식 IANA 원본으로부터 축약 JSON을, `--tables`는 로컬 source.json으로부터 파생 파일 내용을 JSON으로 표준 출력합니다. 두 명령 모두 파일을 자동 덮어쓰지 않습니다. 갱신 시 source.json과 파생 파일을 함께 검토·반영하고 전체 audit를 실행합니다. 계약은 [BCP 47 등록 검증](bcp47-registry.md)을 참고합니다.

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.

소스 변이 검증은 각 변이를 독립 복사본에 적용하고 실행 직전에 그 복사본의 `.zig-cache`를 제거합니다. 같은 길이·같은 시각의 연속 변경이 이전 컴파일 결과를 재사용할 수 있으므로 최초 한 번만 cache를 지우는 것으로는 충분하지 않습니다. `--test-filter`를 사용할 때는 출력된 테스트 이름·개수를 확인하며, root import의 lazy declaration 때문에 전용 모듈 테스트가 수집되지 않으면 해당 Zig 파일을 직접 실행합니다.

ReleaseFast의 누수 검증을 std.testing.allocator의 기본 안전 검사에만 의존하지 않습니다. 특히 기대한 파싱/검증 오류를 잡아 성공으로 반환하는 테스트는 OOM 주입 검사와 별도로 정상 할당 후 오류 경로의 해제량을 확인합니다. 명시적 할당 회계 또는 safety=true인 검사 할당자를 사용하며, 실제로 해제 코드를 제거한 변형이 각 모드에서 실패하는지 확인합니다. Zig 0.16에서 확인한 재현과 보강 근거는 [BMP 적대적 검증](bmp-pixels.md)에 둡니다.

WASM 거부 테스트는 임의 예외나 메시지만으로 성공을 판정하지 않습니다. 파서가 반환한 정상 오류의 종류와 기대 오류명을 확인하고, WebAssembly.RuntimeError 및 호스트 TypeError/RangeError는 테스트 실패로 남깁니다. 독립 oracle도 의도한 검증 실패와 자체 실행 오류를 구분합니다. 실제 trap 주입이 거부 통계에 숨었던 재현과 방어 검사는 [BMP RLE 검증](bmp-rle.md)을 참고합니다.
