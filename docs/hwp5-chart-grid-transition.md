# Grid 공통 Collection·셀 이후 원시 구간

## 계약과 책임

`grid_prelude.zig`의 VtCollection v1·원시 word·VtObject v1 순서를 `collection_header.zig`로 통합했습니다. Prelude의 `collection_prefix` 출력, 행·열, payload_offset, 타입 목록 소유권·한도 계약은 유지합니다. word 0/1/2/65535는 개수로 해석하지 않고 그대로 반환합니다. 제품 차트 소스에서 VtCollection 필드를 읽는 구현은 이제 이 공통 모듈 한 곳입니다.

`grid_backdrop.zig`는 호출자가 확립한 셀 이후 위치에서 raw26과 빈 Picture를 가진 Backdrop을 조립합니다. raw26은 복사하고 Backdrop 파싱은 기존 `backdrop.zig`가 소유합니다. 별도 Section 타입이나 뒤쪽 기반 Object 참조를 추가로 소비하지 않습니다. 실패하면 Reader는 그대로이며 변경됐을 수 있는 타입 목록은 폐기합니다.

Backdrop 내부의 세 inline ID는 기존 지역 중복 검사만 적용합니다. 선행 객체 전체와의 충돌 검사는 상위 범위가 담당하며, 미확정 root/grid 필드를 ID로 추정하지 않습니다. 전체 Grid 종료나 raw26의 필드 의미를 확정한 구현은 아닙니다.

테스트 조립 `chart-footnote-prefix.zig`는 새 코어를 사용하고 `raw_grid_tail`에 원시 구간을 보존합니다. mode 313의 `chart-backdrop-probe.zig`도 이 조립을 공유하여 해당 필드를 직접 출력합니다. 기존 wire 형식은 바꾸지 않습니다.

line-items 앞의 word는 이미 `chart-line-items-prefix.zig`의 `Prefix.word`에 보존돼 있습니다. 이를 버리는 필드로 설명한 것은 잘못입니다. 별도 단일-word 파서를 추가하지 않으며, 향후 전체 제품 조립에서도 이 원시값을 유지해야 합니다.

## 검증 진행

기존 Backdrop 합성 입력 생성기를 `backdrop_test_fixture.zig`로 분리해 기존 Backdrop 검사와 새 Grid 조립 검사가 공유합니다. 제품 serializer에서 fixture를 만들지 않습니다.

신규 Prelude word 검사와 Grid·Backdrop의 offset 0/1/17/257, 모든 잘림, 원시값 복사 수명, 늦은 Picture 데이터/기반 클래스 오류, Reader 보존, OOM 주입을 검사합니다. 실패 시 이름 해제량은 safety=true 할당자와 잔량 0으로 확인합니다. Grid 관련 native 검사(root 포함) 13/13개가 Debug·ReleaseSafe·ReleaseFast에서 통과했습니다.

새 ReleaseSafe WASM의 실제 43개 차트 대조는 Prelude 성공 473/거부 6,493건(68바이트 출력), Backdrop 성공 129/거부 8,944건, tail 성공 129/거부 3,870건으로 모두 종료 코드 0입니다. Backdrop 대조는 새로 보존한 raw26의 변형과 직접 반환을 포함합니다.

분리한 fixture를 사용하는 기존 Backdrop native 검사(root 포함) 4/4개도 Debug에서 다시 통과했습니다.

변경 전 `/tmp/hwpjs-plot-surface-direct-ReleaseSafe.wasm`과 변경 후 WASM에 동일한 Prelude·Backdrop 대조 입력을 전달했습니다. 원본 복구 호출까지 포함한 정상 출력 16,039회와 오류 15,437회의 종류·이름이 일치했습니다. 같은 메시지의 RuntimeError·TypeError·RangeError 또는 raw26 출력 첫 바이트 훼손은 별도 실행에서 모두 AssertionError로 검출했습니다.

별도 복사본에서 Grid·Backdrop Reader 복원 누락, raw26 강제 0, 시작 한 바이트 이동, Prelude word 강제 0, Prelude 실패 시 타입 목록 해제 누락, Collection 기반 타입 소비 누락, Collection 버전 검사 누락의 7종을 주입했습니다. 세 모드 모두 컴파일에 성공한 뒤 실제 테스트 실패·종료 코드 1로 검출됐습니다. 21개 컴파일 로그는 비어 있고 실행 로그 모두 FAIL을 확인했습니다. 로그는 `/tmp/hwpjs-grid-shared-mutants.pkoAAS`입니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit는 각각 종료 코드 0으로 완료됐습니다. 각 모드에서 27/27 단계, native 1,085/1,085개, WASM 검사 8,902,460회, imports 0입니다. 소스·probe를 고정한 순차 실행 로그는 `/tmp/hwpjs-grid-shared-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 기존 회귀와 선택된 코어의 통과이지 전체 문서·차트 필드 지원 완료가 아닙니다.

최종 `zig build test --summary all`의 native 1,085개와 `zig build -Doptimize=ReleaseSafe --summary all`의 5/5 단계 성공도 다시 확인했습니다.

## 다음 조립 단계

개별 구간의 코어 호출을 이어 주는 전체 Contents 조립은 아직 테스트 Prefix 계층에 있습니다. 다음 작업은 원본 버퍼를 빌리는 문자열, 소유한 Grid·타입 목록·Light 원소·Series/Point 배열의 수명과 실패 시 해제를 하나의 명시적 선택 배치 진입점으로 정리하는 것입니다. 테스트에 고정된 네 축·두 선 항목·Series별 Point 개수를 일반 포맷의 자동 판정 규칙으로 옮기지 않습니다. 전체 HWP 문서 검사와 OLE 내부 차트 의미 검증 연결도 이 개별 코어 검증만으로 완료됐다고 주장하지 않습니다.
