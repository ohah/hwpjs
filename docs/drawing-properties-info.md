# 개체 속성 조회

이 도구는 현재 Native 관측의 `content.drawings`에서 선택한 도형/글상자 정보를 읽기 전용으로 보여준다. 그림 크기 편집, 차트 데이터 편집, 일반 도형 전체 편집과 별개다. 크기·배치 쓰기 API, 편집 필드, Apply 버튼, Native 요청은 만들지 않는다.

## Main 통합 계약

```ts
import { createDrawingPropertiesTool } from './drawing-properties-tool.ts';

const drawingProperties = createDrawingPropertiesTool({
  root,
  editor,
  onStatus,
  onClose,
  onPresentationChange, // optional
});
drawingProperties.open({ section, drawingNode }); // void
// Demo teardown:
drawingProperties.dispose(); // void
```

반환 객체는 `open`과 `dispose`만 공개한다. 추가 host/Surface/쓰기 권한은 받지 않는다. `onStatus`, `onClose`, `onPresentationChange`, `onError`는 선택 콜백이다. Main은 `CanvasObjectActivation`의 상태 토큰을 검증한 뒤 `target.kind === 'drawing'`에만 호출한다. 도구는 전달된 주소를 현재 상태에서 새로 캡처한다. 공개 `open`에 성공 boolean을 기대하지 않는다.

## 관측과 소유권

`drawing-properties-port.ts`는 현재 ready 상태·token의 editor/document/generation/operation/view 좌표와 stateVersion을 고정한다. Core의 상태 관측 인스턴스와 캡처 전후 fence를 비교한다. partial/window 문서는 거부한다. 읽기 전용 문서 자체는 조회를 막지 않는다.

정확한 section/drawingNode 행이 하나여야 한다. source.drawing_node, 원본 paragraph와 hostParagraph, anchor_unit과 anchorUnit도 일치해야 한다. 그룹의 다른 노드나 부모 원본을 대신 사용하지 않는다. 현재 Native drawing snapshot 스키마를 확인할 수 없는 형식·도형은 지원을 추정하지 않고 이유만 보고한다. `hwp5Drawings`, renderer의 rectangle, 변환 후 폭·높이 등에서 별도 원본을 재구성하지 않는다.

일반 UI의 제목은 `개체 속성`이다. 내부 section/node 주소는 표시하지 않는다. 크기는 양의 정수인 source.geometry 값에 대해 **width_relative=4(절대 너비), height_relative=2(절대 높이)**가 각각 확인된 축만 기존 `pictureMillimeters`로 변환해 mm로 표시한다. 상대·누락·알 수 없는 기준이나 0/비정상 값은 mm로 추정하지 않는다. 확인할 수 없는 축은 `너비/높이 정보를 확인할 수 없습니다.`로 안내한다. renderer 사각형이나 변환 후 치수에서 대체 값을 가져오지 않는다.

`글자처럼 취급`은 실제 boolean true/false가 있을 때만 예/아니오로 표시한다. 정렬과 본문 배치 enum의 코드-이름 공식 매핑을 이 UI에서 새로 정의하지 않는다. 검증된 공통 사용자용 label SSOT가 없는 값은 일반 화면에서 생략하며, HWPUNIT·원값·text_wrap 코드와 진단 정보도 노출하지 않는다. 내용이 없다는 관측과 내용 정보를 불러오지 못한 경우를 구분한다. 창의 읽기 전용 범위를 명확히 안내한다.

글상자 텍스트는 `content.paragraphs`의 같은 section/drawingNode, source.text의 list_node/node에 연결된 문단만 사용한다. 소유 문단은 **Native 스냅샷의 기존 문서 순서**를 따른다. 전체 문단 배열을 한 번 걸러낸 뒤 해당 소유 문단 번호가 엄격히 증가하는지 순회로 증명한다. 역순·중복·다른 list/text owner·clipped/caption/table 혼합은 거부한다. 정렬로 잘못된 입력을 정상처럼 보정하지 않는다. 번호의 밀집성을 요구하지 않아 0부터 0xffffffff 사이의 큰 간격도 허용하고, 번호 범위를 반복하거나 새 문서 순서 모델을 만들지 않는다. 소유자 검색·문단 처리는 실제 drawings/paragraphs 항목 수에 비례하는 O(D+P)이며 텍스트 출력은 고정된 16,000 UTF-16 코드 단위 상한으로 제한된다.

빈 문단의 줄바꿈을 보존하고 긴 내용은 `내용 (일부만 표시)`로 안내한다. 내용 미제공은 `내용 정보를 확인할 수 없습니다.`, 관측한 빈 내용은 `내용이 없습니다.`로 표시한다. 상태 메시지도 일반 사용자 표현을 사용한다.

## 창 수명과 책임

- `drawing-properties-port.ts`: 읽기 전용 Native 관측, 토큰·소유자 fence, 절대 기준이 증명된 mm 표시, 선형 문단 순서 검증.
- `drawing-properties-controller.ts`: 단일 창, 상태 변경 시 폐기, 오류/재진입 경계, 구독 정리.
- `drawing-properties-view.ts`: 기존 `createDialogLayer`의 modal chrome·Escape·포커스·닫기 수명. 문자열은 textContent로만 넣는다.
- `drawing-properties-tool.ts`: 고정된 Main 인터페이스 조립.

문서 교체뿐 아니라 상태 인스턴스·stateVersion·token revision이 바뀌면 창을 닫는다. stale 문서에 `onClose` 포커스 복원 콜백을 보내지 않는다. 유효한 창의 사용자 닫기는 onClose를 호출한다. 창 열림/닫힘은 선택 onPresentationChange에 알린다. dispose는 구독과 modal DOM/리스너를 정리한다. 공유 demo-controller/shell/Surface 또는 main.ts 연결은 이 패치에 포함하지 않는다.

## 검증

```sh
node --test apps/demo/tests/drawing-properties.test.mjs apps/demo/tests/drawing-properties-view.test.mjs
node_modules/.bin/tsc -p apps/demo/tests/tsconfig.drawing-properties.json
```

TypeScript 집중 검사는 기존 정상 Core SDK의 `packages/core/dist/index.d.ts`를 사용한다. 새 빌드를 요구하지 않으며 OWN 패킷에서는 기존 정상 SDK의 해시 고정 선언 파일을 복사해 검사한다. 23개 단위 검사는 Native content 경계를 통제한 데이터와 fake DOM을 사용한다. 절대/상대 크기 기준의 축별 조합, 내부 정보 비노출, 역순/중복 거부, u32 크기 간격과 6,000개 sparse 문단을 포함한다. 실제 더블클릭 Surface 이벤트·Native·브라우저 연결·공식 한글 동치 검증은 Main의 별도 작업이다. 본 패킷은 새 Native/SDK/gallery 빌드 또는 브라우저를 실행하지 않는다.
