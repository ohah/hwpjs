# Canvas 쪽별 텍스트

Canvas Surface의 `getPageText(pageIndex, { include })`는 현재 조판된 쪽의 텍스트를 읽습니다. `pageIndex`는 문서 전체에서 0부터 세는 물리적 쪽 위치입니다. 빈 쪽도 포함하며, 표시된 쪽 번호를 다시 시작하더라도 물리적 위치는 그대로입니다. 기본 조회 범위는 본문, 표, 글상자, 캡션입니다. `include`에 `body`, `table`, `textbox`, `caption`을 지정해 범위를 고를 수 있습니다.

응답은 읽은 텍스트, 물리적 쪽 위치와 전체 쪽 수, 구역 및 범위 상태를 제공합니다. 현재 페이지 배치나 읽기 순서를 확인할 수 없을 때에는 사유와 함께 부분 결과 또는 가용하지 않은 상태를 반환합니다. 줄바꿈으로 나뉜 동일 문단의 인접 범위는 붙이고, 서로 다른 문단이나 불연속 범위는 줄을 구분합니다.

Vanilla와 React의 Surface 핸들에서 직접 호출합니다. Svelte는 `onReady(surface)`로 받은 같은 Surface를 사용합니다. 입력이 대기 중이거나 표시 장면이 바뀌는 동안에는 현재 관측값이 준비된 뒤 다시 조회합니다.

공개 API 플레이그라운드에서 `load`로 쪽 나눔 샘플을 열고 `getPageText`를 선택하면 물리 쪽 인덱스와 필터를 직접 입력할 수 있습니다. [API 플레이그라운드](https://ohah.github.io/hwpjs/api/playground)
