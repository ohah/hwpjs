# 분할 문단의 그림 기준 영역

`picture-paragraph-page-fragment.mjs`는 여러 페이지에 걸친 문단에서 지원하는 기준 영역만 선택합니다. 문단 시작(unit0)에 있는 TOP/LEFT 앵커는 문단 전체 높이에 의존하지 않으므로 앵커 페이지의 문단 조각을 사용합니다. 다른 앵커 위치·가운데/아래/오른쪽 정렬·변환·역행하는 페이지·불완전하거나 서로 다른 단 기준은 거부합니다. 한 페이지 문단의 기존 정책은 유지합니다.

`projectFloatingPicturePage`는 여전히 전체 문단 원문 구간의 연속성·전체 길이·기하를 확인합니다. 조각 선택이 다른 페이지 원문을 생략해도 된다는 뜻은 아닙니다. 가로 기준은 예약 전에 선언된 `flowParagraphBox`, 없으면 단 기준과 기존 `paragraphLineGeometry`를 사용합니다. 그림을 피한 표시 행의 폭으로 그림 자체 위치를 다시 계산하지 않습니다. 실제 좌표 계산은 기존 `placeFloatingPicture`가 계속 소유합니다.

rhwp의 `renderer/layout/picture_footnote.rs::compute_object_position`에서 TOP/LEFT의 문단 좌표가 문단 높이를 사용하지 않고 para_y/container.x에 offset을 더하는 점을 대조했습니다. 이는 한글 프로그램의 모든 분할 문단 동작을 입증하는 자료가 아니며, 이 경로는 미리보기의 명시적 지원 범위입니다.

검증은 `mise exec -- node --test tests/hwpx/picture-paragraph-page-fragment.test.mjs`입니다. 분할 문단의 앵커 페이지·좌표·예약 전 가로 기준 유지·입력 불변과 미확인 정렬·변환·누락·잘못된 페이지의 거부를 검사합니다.

HEAD를 추출한 격리 게시 소스에서 새2개·기존 정렬1개·위치 조각4개·마지막 개행4개가11/11·실패0·skip0입니다. 작업 트리의 기존 실제 그림 페이지 검사와 새 분할/반복 검사는14/14입니다. 두 실행은 소스 범위가 다르며 합산한 전체 통과율로 쓰지 않습니다.

현재 복합 후보에서는 이전에 거부하던 `issue5543_carried_anchor_ladder.hwpx`가 고정8px 문자 폭과 원문 글자 높이로4페이지·262행 배치됐습니다. 실제 Worker 회귀는 그림350·caption31의 원문 구간 보존·단일 그림 투영·nominal 크기 유지·compound frame의 종이 안 포함·표 footprint 수집 오류0·입력 불변을 확인합니다. 이 전체 파일 결과는 caption ABI와 표/도형 연결 등 미게시 후보를 포함하며 이 단독 수정만으로 가능한 결과가 아닙니다. 실제 브라우저 편집·한글 픽셀 동치·전체 참조 corpus 완료로 확대하지 않습니다.
