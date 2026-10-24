# 그림 흐름의 문단 기준 영역

`picture-fragment-alignment.mjs`는 글자 정렬 후 `x`와 남은 `width`를 표시용으로 유지하면서, 정렬 전 문단 기준 영역을 `paragraphReferenceX`와 `paragraphReferenceWidth`로 전달합니다. ReferenceX는 현재 행 x에 더할 상대 오프셋입니다. 가운데/오른쪽 정렬의 표시 오프셋을 이 값에서 제거하며 너비는 정렬 전 값을 유지합니다.

`nested-paragraph-reference.mjs`는 이 명시적 기준 너비가 있으면 사용하고, 없으면 기존 row.width를 사용합니다. 글자 정렬 때문에 PARA 기준 부동 표의 원점이 이동하거나 기준 영역이 줄어들지 않습니다. 유한하지 않거나 양수가 아닌 기준 너비는 거부합니다. 원본 문서나 표시용 글자 위치는 수정하지 않습니다.

`mise exec -- node --test tests/hwpx/nested-paragraph-reference.test.mjs tests/hwpx/picture-fragment-alignment.test.mjs`로 LEFT/RIGHT/CENTER의 기준점과 너비, 잘못된 값, 기존 텍스트 배치 동작을 확인합니다. 행 좌표를 이미 계산한 입력의 참조 계약이며 전체 문서 페이지 수나 한글 조판 동치의 완료를 뜻하지 않습니다.
