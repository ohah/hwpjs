# 필드 편집 통합 회귀와 기본 검증 연결

2026-10-13 `field-exterior-table-input` WASM SHA256 `1775eeeeeb6fa26a5ee5ea67e18f75898d704c78ba6cf88a66db82e81fcb0a73`로 아래8개 테스트 파일을 Node test-concurrency=2로 함께 실행했습니다.

- field-end-exterior-reference.test.mjs
- field-exterior-inline-reference.test.mjs
- container-field-canvas.test.mjs
- nested-field-canvas.test.mjs
- regulatory-formula-reference.test.mjs
- regulatory-formula-worker.test.mjs
- formula-controls.test.mjs
- formula-worker.test.mjs

최종11/11 exit0, fail/skip/cancel 모두0이며117.8초였습니다. 실제 종료 결과이고, 첫 파일 몇 개의 중간 출력만으로 통합 통과를 계산하지 않았습니다. 이는 필드 source 입력·표 셀·중첩 라벨의 Canvas Worker 하네스, 계산식 정의·Worker·폼 단위 회귀의 선택 실행입니다. 전체 파서/편집 UI/실제 브라우저 레이아웃 완료로 승격하지 않습니다.

## 기본 검증 목록의 누락 수정

build.zig의 HWPX 검증 목록에 메타데이터 전용 run2개·필드 외부 인라인1개·중첩 필드2개·컨테이너 필드3개·종료 마커 외부1개·규제 계산식2개, 총11개 최근 테스트를 추가했습니다. 목록의 추가 addArg 경로301개는 존재/중복 검사를 통과했습니다. 초기 addSystemCommand에 나열된 파일은 이301개 숫자에 포함하지 않습니다.

기본 검증은 HWPJS_TEST_WASM이 없을 때 build 설치 경로의 hwpjs.wasm을 주입하고 명시적 외부 후보 지정은 덮어쓰지 않습니다. 설정 변경 후 fmt 검사와 동일 prefix의 ReleaseSafe build6/6을 통과했으며 WASM compile은 cached였습니다. 이는 빌드 그래프 구성 성공이지 새 기본 목록 전체 실행 완료가 아닙니다. build.zig는 기존 변경과 겹쳐 있으므로 일괄 커밋하지 않았습니다.

## 전체 gate 상태

### 최신 snapshot 검증 시작

누락 방지 자체 검사 `tests/hwpx/field-default-gate.test.mjs`를 추가했습니다. 현재 build.zig를 읽어 최근 테스트12개(자체 검사 포함)의 등록·경로 존재/중복·명시적 HWPJS_TEST_WASM 보존 guard를 검사합니다. 정상1/1 exit0이며 등록 삭제·환경 guard 반전·중복 등록의 세 변조를 모두 거부합니다. 이는 소스 연결 검사이지 Zig 런타임 환경 상속을 직접 관찰한 결과는 아닙니다. 자체 검사도 기본 목록에 연결했으므로 build 등록은 이전11개에서12개 추가로 바뀌었습니다.

최신 `zig fmt --check build.zig src`는 exit0입니다. `zig build test -Doptimize=ReleaseSafe -j1 --summary all`과 명시적1775eeee 후보의 `node --test --test-concurrency=2 tests/hwp5/*.test.mjs tests/hwpx/*.test.mjs` 전체 실행을 별도로 시작했습니다. 시작 당시 HWP5 테스트294개/HWPX363개, 합계657개 파일입니다. 로그는 `zig-out/verification/field-integration-latest/native-full.log`와 `public-full.log`이며 아직 terminal 통과 결과는 없습니다.

시작 시 build.zig SHA256은 `70869d50b03a5d245a16b2f7723c653ce85a60cacfb18197569ab335b92e39d3`, 외부 위치 모듈은 `6c832e7575e7b93a82af0d0566fdce784b1775363ce2e54657ae58daa111fc1e`, 외부 plan은 `b82a191eee60fd20a6b2dd3a70badd57a0109a9b445c1b08dd4fdd1798b7797e`입니다. 이는 일부 소스 identity이며 전체 저장소 불변 snapshot 보증이 아닙니다. 이후 관련 소스 변경이 있으면 기존 결과를 자동 소급하지 않습니다.

오래 실행 중인 metadata-text-sites 전체 native 프로세스18402를 live sample로 재확인했습니다. 이전 created-table-field allocation 검사에서 character_style_formula_snapshot_tests의 실패 할당 sweep으로 이동하여 진행 중이며 종료되지 않았습니다. nested-field-range-boundaries의 이전 public 전체 실행도 프로세스51086이 살아 있고 table-bug 실제 prefix 검사10,500개까지 진행했습니다. 두 실행 모두 현재 후보 이전 snapshot이고, public 실행의 기존 두 실패도 지워지지 않았으므로 최신 전체 통과 근거가 아닙니다.

source 코드·WASM ABI·Worker 정책과 기본 검증 등록의 커밋 및 제품 WASM 승격은 최신 전체 gate가 남아 있습니다. 현재 검증된 테스트/문서 커밋을 그 구현 코드가 원격에 모두 반영됐다는 의미로 읽지 않습니다.
