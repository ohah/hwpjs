# 위아래 그림 예약의 정렬 정책 전달

`paginatePictureRows`의 명시적 `edgePolicy`는 최초 예약과 행 이동 후 재예약에 동일하게 전달합니다. 좌표 계산은 기존 `picturePageReservations` → `projectFloatingPicturePage` → `placeFloatingPicture`가 소유하며 이 경로에 정렬 계산을 복제하지 않습니다.

2026-10-19 회귀에서 `TOP_AND_BOTTOM`·문단 기준·가로 정렬 3/4(안쪽/바깥쪽)에 `inside-start-outside-end`를 전달해도 `unsupported_alignment`로 거부되던 문제를 재현했습니다. 원인은 반복 배치 함수가 예약 함수에 옵션을 전달하지 않은 것입니다. 최초 예약만 고쳐도 재예약에서 다시 실패하므로 양쪽 호출을 수정했습니다.

`tests/hwpx/picture-flow-edge-policy.test.mjs`는 두 정렬의 기대 좌표·예약과 본문의 비중첩·이동 전 앵커 유지·원문/입력 불변을 확인합니다. 정책 누락 및 알 수 없는 정책의 기존 거부도 유지합니다. `mise exec -- node --test tests/hwpx/picture-flow-edge-policy.test.mjs`로 실행하며 정규 HWPX 검사에 등록합니다.

수정 전 실패를 확인했고 수정 후 집중 검사 1/1, 현재 작업 트리의 기존 실제 그림 Worker/페이지 검사와 합쳐 9/9가 통과했습니다. HEAD를 별도로 추출하고 이번 변경만 적용한 격리 소스에서도 집중 검사 1/1이 통과했습니다. 기존 실제 그림 검사는 미게시 테스트를 포함한 작업 트리 결과이며 격리 main 전체 검증으로 주장하지 않습니다.

이 수정은 명시적 정책 전달 경계의 회귀입니다. 도형 `TOP_AND_BOTTOM`의 표·본문 재배치 연결이나 한글 원본 화면과의 조판 동치 완료를 의미하지 않습니다. 도형 지원은 그 경로를 별도로 구현·검증해야 합니다.
