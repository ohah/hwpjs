# HWP5 구간 표시 투영

## 현재 범위

전체 참조 읽기 inventory에는 20,000문단 초과 문서가 5개 있습니다. 최대 HWP5는 `task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp`의 53,448문단입니다. 기본 표시 한도를 늘리는 대신 원하는 구간의 원본 식별자를 보존하는 기초 투영을 추가했습니다.

`web/preview/content.mjs`의 `displayContent`는 선택적 `paragraphOffset`을 받습니다. 전체 문서 평탄 순서의 0부터 시작하는 offset이며, 결과 행의 section/local paragraph 번호는 원본 그대로입니다. HWPX의 1-based native paragraph 번호와 혼용하지 않습니다. `totalParagraphs`는 선택 구간이 아니라 전체 문서의 문단 수입니다. source/native 편집 문서나 저장 입력을 변경하지 않습니다.

기본 offset 0, 최대 텍스트 200,000 UTF16·최대 문단 20,000을 유지합니다. bounds는 음이 아닌 안전한 정수여야 하며 모호한 값은 `InvalidDisplayBounds`로 거부합니다. 텍스트 소진 뒤의 문단 식별자는 문단 한도 안에서 clipped·비편집 상태로 보존합니다. 앞/뒤 생략은 limited로 알립니다.

## 검증과 남은 연결

`tests/hwp5/paragraph-offset-projection.test.mjs`는 합성 다구역의 2만 경계·마지막 문단·Unicode 예산·잘못된 bound·입력 불변과 실제 53,448문단 문서의 offset 0/19,999/20,000/53,447 식별자를 확인합니다. 후보 e1609e28 및 현재 기본 WASM cbaaf27f 각각 3/3·skip 0·종료코드 0입니다. 기존 bounded identity/Canvas preview와 기초 합성 검사는 15/15로 통과했습니다.

이 투영만으로 HWP5 UI 구간 이동을 구현한 것은 아닙니다. Worker 연결, 표·그림·주석·필드 소유 문단의 구간 밖 의존성 보존, native 현재 텍스트/서식 갱신, 이동 후 편집·이력·저장·재열기와 실제 브라우저 검증이 남습니다. 구간 선택 뒤 전체 표를 버리거나 미완성 소유권 검사기를 완화하지 않습니다. 원본 조판 동일성이나 모든 큰 문서 편집 지원 완료도 주장하지 않습니다.
