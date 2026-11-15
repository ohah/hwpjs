# 개체 속성 조회

이 도구는 현재 Native 관측에서 공통 `drawing-observation.mjs` query로 검증한 도형/글상자 정보를 읽기 전용으로 보여준다. 그림 크기 편집, 차트 데이터 편집, 일반 도형 전체 편집과 별개다. 크기·배치 쓰기 API, 편집 필드, Apply 버튼, Native 요청은 만들지 않는다.

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

정확한 section/drawingNode 행이 하나여야 한다. HWPX는 source.drawing_node, 원본 paragraph와 hostParagraph, anchor_unit과 anchorUnit이 일치해야 한다. H5는 이미 공개된 projected drawing을 raw hwp5Drawings의 component/control과 연결하고 Native anchor·body paragraph flow·local transform·component 관측을 검증한다. HWPX 주소 필드를 H5에 만들어 붙이지 않는다. 새 H5 조회는 현재 관측이 증명하는 독립·무회전·identity local transform인 사각형 글상자로 한정한다. 그룹, 누락된 회전/변환, 모호한 owner, partial/window와 불완전 관측은 거부한다.

hit·활성화 전달·속성 조회가 같은 형식별 read SSOT를 사용한다. query는 선택·StateToken·쓰기 권한을 발급하지 않는다. caller의 현재 상태/token/painted-frame fence는 계속 필요하다. renderer 사각형은 실제 border hit를 위한 위치이며 크기 표시의 원본은 아니다. H5 크기와 기준은 기존 hwp5DrawingGeometry의 Native 원본 해석을 재사용한다.

일반 UI의 제목은 `개체 속성`이다. 내부 section/node 주소는 표시하지 않는다. 크기는 양의 정수인 source.geometry 값에 대해 **width_relative=4(절대 너비), height_relative=2(절대 높이)**가 각각 확인된 축만 기존 `pictureMillimeters`로 변환해 mm로 표시한다. 상대·누락·알 수 없는 기준이나 0/비정상 값은 mm로 추정하지 않는다. 확인할 수 없는 축은 `너비/높이 정보를 확인할 수 없습니다.`로 안내한다. renderer 사각형이나 변환 후 치수에서 대체 값을 가져오지 않는다.

`글자처럼 취급`은 실제 boolean true/false가 있을 때만 예/아니오로 표시한다. 정렬과 본문 배치 enum의 코드-이름 공식 매핑을 이 UI에서 새로 정의하지 않는다. 검증된 공통 사용자용 label SSOT가 없는 값은 일반 화면에서 생략하며, HWPUNIT·원값·text_wrap 코드와 진단 정보도 노출하지 않는다. 내용이 없다는 관측과 내용 정보를 불러오지 못한 경우를 구분한다. 창의 읽기 전용 범위를 명확히 안내한다.

HWPX 글상자 텍스트는 `content.paragraphs`의 같은 section/drawingNode, source.text의 list_node/node에 연결된 문단만 사용한다. H5는 Native body list와 flow의 parent/list membership, projected drawingText의 list, 같은 순서의 paragraph membership을 증명한다. H5의 source.text에 없는 node 필드를 추정하지 않으며 caption은 본문으로 섞지 않는다. 소유 문단은 **Native 스냅샷의 기존 문서 순서**를 따른다. 전체 문단 배열을 한 번 걸러낸 뒤 해당 소유 문단 번호가 엄격히 증가하는지 순회로 증명한다. 역순·중복·다른 list/text owner·clipped/caption/table 혼합은 거부한다. 정렬로 잘못된 입력을 정상처럼 보정하지 않는다. 번호의 밀집성을 요구하지 않아 0부터 0xffffffff 사이의 큰 간격도 허용하고, 번호 범위를 반복하거나 새 문서 순서 모델을 만들지 않는다. 한 동기 query는 Native 관측의 drawing·paragraph·flow·component·offset 항목을 지역 index로 한 번 준비한다. H5 anchor 경계는 같은 호스트별로 기존 sourceTextChanges를 통해 일괄 변환하므로 owner마다 offset 전체를 다시 순회하지 않는다. 입력 항목 I, 조회 Q, 출력 문자 T에 대해 평균 O(I+Q+T)이며 공간은 O(I)다. 정렬이나 번호 간격 반복 없이 Native 순서를 증명한다. 텍스트 출력은 16,000 UTF-16 코드 단위로 제한한다.

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

## H5 border failure의 원인과 새 검증 범위

공식63 SDK와 정확 a66, 승인된 공개 textbox.hwp에서 raw H5 owner1과 public projected drawing1 및 실제 Canvas placement1을 확인했다. collection 누락이 원인은 아니었다. 기존 hit의 HWPX 전용 transform_identity 요구가 최초 거부점이었고, port는 후속 HWPX 원본 주소/text.node 요구에서도 거부했다. 새 query는 기존 Native H5 관측을 연결하며 회전 누락을0으로 바꾸지 않는다. Native/Runtime DTO나 reader-runtime을 수정하지 않는다.

원래52 GUI 실패와 새63 baseline25초 실패, 실제 Core snapshot·Canvas join 증거를 소유 패킷에 보존했다. source unit과 실제 GUI의 결과는 그 패킷에서 분리한다. 이 조회 수정을 H5 글상자 편집·새 생성·저장/재열기 완료나 그룹·회전 객체 지원으로 확대하지 않는다.

검증 코호트: 개체 소스79개(신규 H5 read/owner/transform/text/선형 경계9 포함)·관련 noEmit·lint/format 통과. 새 일반 SDK/gallery에서 exact a66을 재사용한 GUI7 관측은 H5 100%/200% border 속성, Native 크기/본문·읽기 전용 표시, H5 내부 caret 유지, HWPX border/interior 유지다. Native content edit·저장/재열기·OS IME는 이번 검증에서 실행하지 않았다. 기존 Core SDK를 그대로 사용하고 변경된 Vanilla JS SDK만 빌드했으며 Native compiler는 실행하지 않았다.
