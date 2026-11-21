# H5 series/category 공통 grid 후보

이 문서는 860b744b 기준 격리 source 후보의 표시 책임을 설명한다. Native, ABI, capability, Core/Worker 명령, 실제 편집 dialog/menu를 추가하지 않는다. Native 소유 5d0a88f9의 구현과 파일을 공유하지 않는다. 실제 편집 가능 여부는 별도 issuer/query와 승인된 ABI가 정해진 후 format adapter가 검사한다.

## 실제 변경 범위

`chart-point-grid.mjs`에 선택적인 `projectModel`과 `rowLabel`을 추가했다. 기본값은 기존 chartPointGridModel과 기존 포인트 문자열이다. 기존 HWPX 호출자는 수정하지 않는다. sparse/duplicate/cache별 point ordinal, 페이지 크기32/8, 선택, draft 표시, busy/닫힘/분리된 버튼 거부를 유지한다. HWPX 원본 grid model/controls/기존 시험은 byte-exact다.

`hwp5-literal-grid-projection.mjs`는 표시 전용 `{categories:string[],series:{name:string,values:string[]}[]}`를 받는다. row는 category, 첫 열은 category 이름, 나머지 열은 각 series의 값이다. 중복 이름은 합치지 않는다. 원본 문자열, CRLF/tab/literalUFFFC/emoji를 유지한다. sparse/ragged 배열과 잘못된 scalar 문자열을 거부한다.

반환된 `chart`는 공통 grid의 표시 입력이고 `projectModel`은 해당 chart identity에만 대응한다. `cellAddress(id)`는 `{kind:'category',category,expected}` 또는 `{kind:'value',series,category,expected}`를 반환한다. 이 id는 local 표시 인덱스다. HWPX point ordinal, Native 주소, owner witness, edit lease가 아니다. 표시 객체 복사본을 편집 권한으로 승격할 수 없다.

표시 한도는 category4096, series64, value16384다. category 열을 포함하면 최대20480개의 UI 셀이 생긴다. 이는 현재 Native owner 계약과 맞춘 표시 자원 상한이며 새 ABI나 편집 capability의 약속이 아니다. 계열명은 헤더만 표시하고 계열/범주 개수 변경을 구현하지 않는다. 입력값의 Native numeric 문법/UTF8 budget 검사는 이후 권한 있는 command adapter 책임이다.

## 연결 책임과 예시

format adapter가 실제 Native 조회로 얻은 문자열 DTO를 이 projection에 제공한다. canonical edit admission, full owner/HistoryTicket/resource/XML 검증을 projection 함수에 넣지 않는다. grid는 문서나 draft를 쓰지 않고 선택한 cell id만 알려준다.

```js
const projection = createHwp5LiteralGridProjection(displayValues);
const grid = createChartPointGrid({
  ...nodes,
  getChart: () => projection.chart,
  projectModel: projection.projectModel,
  rowLabel: '범주',
  getSelected: () => selectedCell,
  getDraft: id => localDrafts.get(id),
  accepts: kind => ['hwp5_literal_category', 'hwp5_literal_value'].includes(kind),
  ready: () => capture.current(),
  select: id => showExistingValueForm(projection.cellAddress(id)),
});
```

`capture.current`, 값 입력 form, draft 관리와 최종 apply는 이 패킷에 구현하지 않았다. 위 코드는 연결 예시이며 제품 진입점을 활성화하지 않는다. 문서/target/capture가 바뀌면 이전 grid를 close하고 새 projection을 생성해야 한다. 같은 숫자 id를 새 문서 주소로 재사용하지 않는다. busy/IME/close를 data controller가 관리하며 불명확 commit 재시도는 금지한다.

최종 apply의 owner 발급, optional ABI, worker shared painter, async PNG stale 검증은 별도 UI-CORE-WORKER-CONTRACT.md 및 Native owner 계약을 따른다. 이 표시 모델의 expected 문자열만으로 쓰기를 호출할 수 없다. 기존 읽기 전용 H5 속성 창과 미지원 차트의 표시 경로도 그대로 둔다.

## 검증 범위

새 합성4는 중복 이름과 논리 주소, sparse/ragged/잘못된 Unicode와 한도, 34category/9series 페이지 이동과 실제 grid 선택 callback, exact20480 표시 경계를 검사했다. 기존 HWPX grid 합성3은 원본 파일에서 이름 필터로 실행했다. 기존 raw28 실제 문서 시험은 실행하지 않았다. 이 결과는 Native, SDK, Worker, 실제 browser/GUI 또는 데이터 편집 완료를 의미하지 않는다.

CI 등록은 현재 후보에 추가하지 않았다. Main 합성 후 새 정확한 트리에서 아래 새 파일의 4개 시험을 명시 등록하면 된다. 기존 chart-point-grid 전체 명부의 expected 수를 변경하지 않는다.

```sh
node --test --test-concurrency=1 --test-reporter=tap tests/canvas/hwp5-literal-grid-projection.test.mjs
```
