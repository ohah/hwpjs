# 그림 캡션 프레임

`web/preview/picture-caption-frame.mjs`의 `measurePictureCaptionFrame`은 기존 `layoutPictureCaption`을 사용해 이미지 `rectangle`, 캡션 `captionRectangle`, 전체 점유 `flowRectangle`, 원본 문단 소유권을 유지한 `rows`를 분리해 반환합니다. 측정 성공은 `state: "measured"`입니다. 원본 그림 크기와 문서를 수정하지 않습니다.

이미지 사각형은 유한한 좌표와 양수 너비·높이를 가져야 하며 끝 좌표의 overflow도 거부합니다. `maxRows`는 기본20,000의 양수 안전 정수입니다. 캡션 내용·너비·간격·원본 소유권과 서식 측정은 기존 공통 캡션 엔진이 소유합니다. `picture-page-reservations.mjs`는 이 프레임의 점유 영역으로 본문 공간을 예약합니다.

검증은 `mise exec -- node --test tests/hwpx/captioned-picture-body.test.mjs`입니다. 원본 이미지 크기와 전체 점유 높이의 차이, 캡션 텍스트와 소유권, 잘못된 좌표·예산·내용 부재 및 기존 본문 예약 동작을 검사합니다. 이 계약은 셀 내부 캡션·편집 저장·한글 조판 동치 전체의 완료를 주장하지 않습니다.
