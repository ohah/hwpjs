# Plot·Surface 접두부 코어

## 계약

[Plot 조사](hwp5-chart-plot-evidence.md)와 [Surface 조사](hwp5-chart-surface-evidence.md)의 선택 배치를 코어로 분리합니다. API 속성 표를 직렬화 순서로 해석하거나 원시 필드의 의미를 확정하지 않습니다.

- `src/hwp5/chart/plot_prefix.zig`: inline Plot ID·VtChartPlot v4·빈 초기 배열·raw136. Light 시작 직전에 멈춥니다.
- `src/hwp5/chart/surface_prefix.zig`: raw30·inline Surface ID·VtSurfaceDesc v1·raw46·빈 후속 배열. 뒤쪽 Axis는 읽지 않습니다.
- 배열 필드 순서는 기존 `array_header.zig`와 그 하위 `collection_header.zig`가 소유합니다.

각 반환값은 원시 바이트를 복사하며 배열 헤더와 절대 끝 위치를 보존합니다. 두 ID는 호출자가 확립한 객체 범위에 등록합니다. 실패하면 각 진입점의 Reader는 그대로이고, 변경됐을 수 있는 타입·객체 테이블은 폐기해야 합니다. 전체 Plot/Surface의 끝이나 배열 소유 관계를 주장하지 않습니다.

기존 테스트 경로의 오류 구분을 유지합니다. 배열 word 불일치는 둘 다 UnsupportedChartArrayLayout입니다. 같은 비영 word는 Plot에서 UnsupportedChartInitialArray, Surface에서 선택 경로의 0개 제한에 따른 LimitExceeded입니다. 전체 형식의 유효/무효 판정이 아니라 현재 선택 배치의 지원 제한입니다.

`tests/hwp5/chart-light-prefix.zig`와 `chart-nullable-title-prefix.zig`의 중복 파싱을 위 코어 호출로 교체했습니다. 네 축의 선택·개수와 뒤쪽 nullable 제목 처리는 여전히 테스트 경로의 책임이며 일반 Contents 제품 라우팅이 아닙니다.

## 검증 진행

독립 합성 바이트 생성은 `plot_surface_test_fixture.zig`, 단위 검사는 `plot_surface_tests.zig`로 분리했습니다. 신규/기존 타입, offset 0/1/17/257, 모든 잘림, 원시 바이트 복사 수명, null·선행/내부 중복 ID, 개수 제한, 배열 오류 구분, 각 선언·기존 타입의 클래스/버전, OOM 주입을 검사합니다. 실패 경로는 safety=true 할당자의 해제 결과도 확인합니다.

새 코어를 연결한 ReleaseSafe WASM으로 기존 독립 대조를 재실행했습니다. 각 43개 차트의 성공/거부는 PostLine 215/9718, Footnote 301/21199, Legend 258/11211, Light 173/6720, Picture 172/3010, Backdrop 129/8944, suffix 426/9004, TextFormat 200/3749, Axis 344/106570, SeriesLabel 182/11304, SeriesPrefix 215/4988, tail 129/3870이며 모두 종료 코드 0입니다.

위 기존 경로 회귀와 별도로 mode 334(Plot)·335(Surface)의 직접 대조를 정규 audit에 연결했습니다. `chart-plot-surface-probe.zig`는 명시적으로 주입한 선행 타입·객체 목록으로 해당 접두부만 파싱합니다. 자동 형식 판정이나 공개 ABI가 아닙니다. `chart-plot-surface-prefixes.mjs`는 독립 조사기에서 경계·기대 바이트·선행 범위를 얻고, Surface 조사기에 추가한 타입 참조·word 위치 메타데이터로 변형 위치를 공유합니다.

Debug·ReleaseSafe·ReleaseFast 실제 43개 차트의 직접 대조는 각각 Plot 성공 172/거부 9,030건, Surface 성공 172/거부 5,934건으로 종료 코드 0입니다. 원본·정확한 끝 잘라내기·뒤쪽 데이터 추가·원시 영역 FF 변형을 수락하며, 모든 접두부 잘림·null/중복 ID·각 신규 선언의 클래스/버전·각 타입 참조의 잘못된 클래스·배열 양쪽 word·객체 제한을 거부합니다. 거부 뒤 원본 재파싱을 대조합니다.

오류 판정은 정확한 Error 생성자와 기대 이름을 요구합니다. 같은 메시지의 RuntimeError·TypeError·RangeError를 대신 던지거나 정상 출력 첫 바이트를 변형한 별도 실행은 모두 AssertionError로 실패했습니다.

Surface 조사기에 새로 추가한 참조·word 위치 정보만 제외하면 기존 반환값 전체가 변경 전 HEAD의 조사기와 43개 실제 차트에서 일치함을 별도 대조했습니다.

신규 native 테스트 4개는 세 빌드 모드에서 모두 통과했습니다. 독립 조사 테스트도 56/56개 통과했습니다.

별도 복사본에서 Reader 복원 누락 2종, ID 등록 누락 2종, 타입 버전 검사 누락 2종, 배열 배치 검사 누락 2종, 원시 영역 강제 0 변형 3종을 주입했습니다. 총 11종이 Debug·ReleaseSafe·ReleaseFast에서 모두 컴파일에 성공한 뒤 실제 테스트 실패·종료 코드 1로 검출됐습니다. 33개 컴파일 로그는 비어 있고 실행 로그 모두 FAIL을 확인했습니다. 로그는 `/tmp/hwpjs-plot-surface-mutants.TvPfLg`입니다.

Debug·ReleaseSafe·ReleaseFast 전체 audit는 각각 종료 코드 0으로 완료됐습니다. 각 모드에서 27/27 단계, native 1,082/1,082개, WASM 검사 8,902,460회, imports 0입니다. 소스·probe를 고정하고 순차 실행한 전체 로그는 `/tmp/hwpjs-plot-surface-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 선택된 접두부와 기존 회귀의 통과이며 전체 Contents 라우팅·미확정 필드 지원 완료가 아닙니다.

최종 `zig build test --summary all`의 native 1,082개와 `zig build -Doptimize=ReleaseSafe --summary all`의 5/5 단계 성공도 다시 확인했습니다.

## 다음 연결 공백

소스 재검토에서 `grid_prelude.zig`에 Collection v1·word·Object v1 읽기가 별도로 남아 있음을 확인했습니다. 공통 `collection_header.zig`로 공유할 수 있는지 기존 Prelude 출력·오류·할당 실패 계약을 대조해야 합니다. 테스트 전용 `chart-footnote-prefix.zig`의 셀 이후 raw26과 `chart-line-items-prefix.zig`의 raw word도 전체 조립 시 명시적으로 보존해야 합니다. 이 잔여 구간이나 자동 배열·축 선택, 미확정 ID·필드 의미까지 이번 접두부 코어 완료에 포함하지 않습니다.
