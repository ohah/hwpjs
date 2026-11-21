# H5 기존 차트 데이터 편집 JS 연결 후보

이 문서는 9caafcc5 기준 격리 JS/Core/Worker/demo 후속의 소유 경계와 실행 게이트다. Native optional4 구현은 Socrates가 소유하며 이 후속에서 수정하지 않는다. Native 7c19의 집중12, 9911 lease/wire 집중8, Small의565 exports와 raw bridge6은 각각 다른 코호트다. 이 JS 후보의 mock 검증은 Native/SDK/실제 GUI의 성공 증거가 아니다.

## 공개 호출과 권한

Core 및 public source index는 `createHwp5ChartDataEditor(editor)`를 제공한다. `capture({section,controlNode})`는 기존 Native 소스 입장 증거와 ready/writable/full 문서, HistoryV2, 현재 실제 H5 target을 요구한다. 표시 capability만 있는 mock/직접 compile/unknown module은 권한을 얻지 않는다. 반환 capture는 private WeakMap에 기록되며 JSON 복사본은 사용할 수 없다.

Core capture는 state identity와 실제 token을 유지한다. resource 응답 뒤 다시 state와 target/revision을 확인한다. public apply는 capture와 category/value 논리 편집 목록만 받는다. `PNG`, `rendered`, callback 또는 trusted 플래그는 전달하지 않는다. public DTO는 Core가 소유하는 명시 타입이며 runtime validator의 추론 타입을 외부 선언으로 노출하지 않는다.

raw H5 facade의 `captureHwp5ChartData`와 `editHwp5ChartData`도 private capture를 사용한다. Native lease의 full ticket4축 lo/hi, viewEpoch, revision, owner/resource/XML/pixel witness는 registry 안에 남는다. 각 비동기 경계에서 Native lease를 재조회해 전체 witness와 비교한다. Native가 commit 직전에도 witness를 별도로 검증한다. export 존재와 이 private registry는 모듈 qualification을 대체하지 않는다.

## Worker 최종 raster와 History

Worker의 `hwp5-chart-data-capture` read는 자신의 facade capture를 opaque key에 연결한다. `hwp5-chart-data-apply`는 해당 editor에서 발급한 key와 strict edits만 받는다. key는 한 번 소비하며 editor 교체/load/dispose 때 폐기한다. retained literals는128개와 전체16MiB로 제한한다.

최종 apply는 같은 Native Plan으로 preview를 얻고 `hwp5-chart-literal-edit-preview` scope/data/hash/pixel을 검사한다. changed=true면 실제 Worker OffscreenCanvas와 기존 shared model painter를 호출한다. UI 미리보기, 임의 callback PNG, fixture PNG와 cached previewValue를 대체 입력으로 사용하지 않는다. paint/blob/arrayBuffer 각 완료 뒤와 Native call 직전에 current witness를 검사한다. no-op은 rendered:null과 PNG0으로 commit하며 Canvas가 없어도 painter를 호출하지 않는다.

single commit은 기존 applyNativeEdit completion 분류를 사용한다. observed applied 이후 PNG backing 정리 실패도 applied를 보존하고 refreshRequired로 전파한다. unknown은 기존 Worker history poison, committed-refresh-required 경로를 따른다. 자동 재시도와 실패 기대 완화는 없다. COW, default strict-layout save/consent, undo/redo는 기존 Native/Core 규약을 사용한다.

## 실제 데모 연결

기존 edit-chart-data action은 형식별 도구로 분기한다. HWPX controller/port/view의 구현은 수정하지 않는다. H5 메뉴는 현재 host의 실제 selected object target을 전달한다. H5 속성 창은 현재 Native canonical lease를 읽어 편집 입장이 성공한 경우에만 데이터 편집 버튼을 추가한다. 읽기만 가능한 다른 차트의 속성 창은 그대로 유지한다.

새 H5 도구는 공통 dialog layer와 기존 series/category projection/grid를 사용한다. category 행/series 열의 실제 cellAddress를 통해 값 form을 채우며, Apply는 expected 원문과 논리 주소를 한 요청으로 전달한다. series 이름/개수와 category 개수 변경은 제공하지 않는다. IME 중 Apply/취소를 막고 입력 필드는 유지한다. close/dispose/문서 변경 후 늦은 응답은 버린다.

## 타입와 source mock 검증

`tools/tests/tsconfig.hwp5-chart-data.json`은 새 Core/public factory와 raw facade 타입, UI 도구를 검사한다. 별도 public consumer type 시험은 PNG 및 renderer 인자를 거부한다. 기존 데모 전체의 타입 문제는 집중 타입 성공으로 대체하지 않으며 별도 baseline 진단에 기록한다.

`hwp5-chart-data-source-provider.mjs`는 source mock 시험에서 정확한 새 UI importer 한 곳만 실제 Core source 함수에 연결한다. 실제 SDK 또는 배포 loader가 아니며 Native profile을 등록하지 않는다. DOM 이벤트 시험의 private source observation도 제어된 시험 대역이다.

CI는 JS/painter mock, 기존 create raster, 새 Core/UI 이벤트, 기존 HWPX data controller/port/view와 H5 read-only properties의 정규 Node 명령을59개로 수집한다. 실제 수집 명부를 로그에서 고정한다. 기존 object-activation 명부의 카운트는 변경하지 않는다.

## 공식 artifact와 남은 게이트

사용자가 확인한9911 Small은5374853bytes, SHA256 `9f383a8c3c16d85570e4a994a92e5468d74238f7150b6917f897f349713bbe45`다. 재컴파일하지 않는다. 현재 JS 제품 patch는 native-module-profiles를 변경하지 않는다. 이 hash는 현재9ca profile에 없으므로 별도 controlled qualification 후보가 필요하다. 같은 ownerWindow 프로필의 source-only patch를 별도로 제공하며 자동 적용/채택하지 않는다.

후속 순서는 Main exact source 합성 및 controlled profile 승인/핀, forms known/direct/unknown 음성, source cell/grid와 기존 Worker COW/history/public full, 공식 Core JS 및 public umbrella와 gallery, 정상 패키지 이름 import, Native shared painter 기반 실제 저장 파일의 독립 XML/PNG/COW/History oracle, 실제 GUI다. raw bridge의 synthetic PNG64를 제품 입력으로 넘기지 않는다. R9 우선순위와 현재 슬롯을 확인하기 전 producer/browser를 시작하지 않는다.

Core dist와 standalone public umbrella는 새 helper/runtime/Worker 및 WASM으로 다시 생성해야 한다. framework dist 재사용 가능 여부는 REUSE-PROOF.json에 기록한 실제 sourcemap와 source 일치 검사를 따른다. 기존860b artifact는 변경하지 않는다. 실제 producer output/생성 선언 containment, private Core evidence singleton, source asset closure와 browser의 current target을 별도로 확인해야 한다.
