# 도형 내부 인라인 그림 소속

[그림 원본 검사](picture-source-validation.md)가 오류 필드와 crop 배열 구조의 단일 출처입니다.

`drawing-picture-scope.mjs`는 그림의 구역·원본 문단을 확인해 본문 그림과 도형 텍스트/캡션 내부 그림을 분리합니다. 도형 문단을 본문 목록에서 제외한 뒤 그 내부 그림만 본문에 전달하면 인라인 그림 색인이 불완전해집니다. 내부 그림을 독립 root 그림으로 다시 배치하는 것도 올바르지 않습니다.

내부 그림은 기존 `inlinePictureIndex`와 `pictureTextMeasure`로 크기를 측정하고 도형 텍스트/캡션 행에 남깁니다. 별도 `flowPictures` 사각형을 추가하지 않습니다. 원문·그림 기하·앵커는 변경하지 않습니다. 모호한 문단/그림, 손상된 그림, 미지원 내부 floating 그림·그림 자체의 캡션은 명시적으로 거부합니다.

`tests/hwpx/drawing-picture-scope.test.mjs`는 순수 분류/크기, 음성 입력, 실제 도형 본문 합성 경로, 실제 참조2문서의 소속을 검사합니다. 본문 통합 검사는 내부 그림이 root 투영으로 넘어가지 않고 원본20×30px 크기로 행에 측정되며 전체 입력이 불변임을 확인합니다. 실제 참조 검사는 기본 WASM을 명시한 격리 소스에서 수행했으며 참조가 없을 때의 skip을 통과 증거로 삼지 않습니다.

실제 `copay_cap_tac_table_leading.hwpx`의2187/2211과 `issue5543_carried_anchor_ladder.hwpx`의615/639가 각각 도형 내부 인라인 그림입니다. 작업 트리의 후보에 수정한 결과 기존 `UnsupportedTablePagePictures`는 각각 `ConflictingSourceTableColumns`와 `UnsupportedInlineTableHost`로 바뀌었습니다. 후자는 도형 앵커와 인라인 표 앵커가 같은 문단에 섞인 경로를 더 확인해야 합니다. 이는 추가 실패 지점을 노출한 결과이며 두 문서의 전체 페이지 지원·실제 픽셀 렌더링/브라우저 편집 완료 증거는 아닙니다.

게시 수정은 도형 내부 그림 분류·측정·중복 root 투영 방지입니다. 기존 미게시 본문/표 그림 조합이나 도형 감싸기 정책 후보 전체를 함께 게시하지 않습니다.

격리 게시 소스의 이번4개 검사와 기존 예약/정렬 회귀를 합쳐9/9, skip0으로 통과했습니다. 현재 작업 트리의 추적 HWPX Worker 페이지 검사도45개 paginated를 유지했습니다. 이 두 결과는 서로 다른 소스 범위의 증거이며 격리 main 전체 corpus 완료로 합산하지 않습니다.
