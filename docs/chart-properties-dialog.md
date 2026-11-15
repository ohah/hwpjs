# 차트 개체 속성

`createChartPropertiesTool`은 기존 HWPX 차트의 **개체 속성**을 읽기 전용 모달로 표시합니다. 차트 더블클릭의 기본 진입점으로 연결하며, 차트 데이터 편집은 별도 버튼으로 기존 편집기에 넘깁니다. 이 모듈은 개체 선택/event bridge를 소유하지 않습니다.

```ts
const properties = createChartPropertiesTool({
  root,
  editor,
  onStatus,
  onClose,
  onEditData: (target) => existingChartDataEditor.open(target),
  getDataEditAvailability: () => existingChartDataEditor.presentation(),
});
properties.open({ section, wrapper });
properties.dispose();
```

공개 반환값은 `open(target): void`, `dispose(): void`입니다. `getDataEditAvailability`는 선택 사항이며, 생략·예외·enabled 미확인 시 데이터 편집 버튼은 비활성화됩니다. 기존 chart-data port의 presentation 결과만 사용하고 이 모듈에서 write capability를 추정하지 않습니다. 읽기 전용 문서에서도 현재 차트 기본 속성 조회는 가능합니다.

## 현재 값과 표시

Port는 ready HWPX 상태에서 유일한 chart target·현재 OLE owner·U+FFFC 문단 주소를 확인하고, 복사한 현재 토큰으로 `editor.readResource({kind:'chart-display',section,wrapper}, token)`을 한 번 호출합니다. Native 응답의 pair/host와 현재 OLE frame을 검사하고 독립 복사한 source를 깊게 동결합니다. preview cache, bitmap, 화면상 크기, 선택 사각형을 사용하지 않습니다.

너비는 Native `width_relative === 4`, 높이는 `height_relative === 2`인 경우에만 기존 `pictureMillimeters`로 표시합니다. 상대 크기·누락 값은 명확히 표시하며 절대 mm를 추정하지 않습니다. 위치 간격은 확인된 원본 offset만 같은 단위 변환으로 표시합니다. 제목은 기존 ownership-complete Native title 투영 helper가 입증하는 텍스트만 표시하고, 축약 시 ‘제목 (일부)’로 구분합니다. UI에는 section/node ID, 원시 enum 정수, 내부 단위 값이 노출되지 않습니다.

크기·위치·제목은 편집할 수 없습니다. chart resize/write, 문서 저장, 새 데이터 편집 구현은 포함하지 않습니다.

## 수명과 데이터 편집 전환

상태 객체, 문서, generation, operation/view token이 바뀌면 창을 닫습니다. 읽기 중 중복 open은 같은 창에 포커스하고, 다른 대상의 중첩 읽기는 접수하지 않습니다. 닫힘/상태 변경/dispose 후 늦은 응답과 오래된 버튼 callback은 무시합니다. Native 오류는 재시도하지 않고 창을 닫아 상태를 알립니다.

‘데이터 편집’은 현재 capture와 최신 `getDataEditAvailability().enabled`를 확인하고 속성 모달을 먼저 파괴합니다. 파괴 중 host 재진입 가능성을 고려해 현재성·availability·중복 창을 다시 검사한 뒤 불변의 정확한 `{section,wrapper}`를 `onEditData`에 전달합니다. 기존 chart-data 도구가 최종 편집 admission을 계속 소유합니다. 자동 대상 대체·다른 차트 선택은 하지 않습니다.

`onClose`는 현재 문서의 수동 닫힘 때만 호출하는 포커스 복귀 callback입니다. 데이터 편집 전환, 상태 무효화, dispose에서는 호출하지 않습니다. pending read 중 수동 닫힘도 가능하지만 해당 read가 끝나기 전 새 read를 병렬 실행하지 않습니다.

## 검증 범위

집중 Node 테스트는 Native 질의 계약, 불변 source, 잘못된 소유권/응답 거부, 중복/late read, state/token 변경, destroy 재진입, readonly 표시, unit/title SSOT, 동적 availability, 닫힘 후 정확한 target 전달을 검사합니다. 실제 Native/WASM, 브라우저 dialog/focus, Main 연결, 저장 또는 배포를 검증한 결과는 아닙니다.
