# 예약 영역의 본문 행 재측정

`web/preview/reserved-body-callbacks.mjs`는 한 요청의 예약 목록을 공유하는 수직 전진·위치 확정 재측정 callback을 소유한다. 글자 분할·감싸기 공간 선택은 기존 `measureReservedBodyRow`를 재사용한다. 표 band는 변경하지 않는다. 외부 전진 callback과의 합성은 유한·단조 전진과 반복 예산을 검사하고, 실패 상태는 callback 인스턴스의 요청 수명에만 둔다.

기존 `reserved-picture-page-flow.mjs`가 이 callback을 사용한다. 원본 문단 carrier 선택·그림/캡션의 위치·반복 수렴·앵커 최소 페이지·최종 표 침범 검사는 각각 기존 소유 모듈에 남긴다. 공개 오류 호환성을 위해 기존 `InvalidReservedPictureAdvance` 등의 오류 이름을 유지한다.

2026-10-20: 그림 예약·본문 원문 carrier·표/그림 침범 3파일 14/14·skip 0. 새 callback 회귀는 실제 오른쪽 SQUARE 영역 선택·원본 불변·표 band 보존·외부 전진·비수렴 제한·요청 간 실패 격리를 검사한다. 이 추출만으로 도형 SQUARE 배치 지원을 선언하지 않는다.

게시 전 main 기반 격리 사본 `/tmp/hwpjs-reserved-callbacks-publish.Yv1w6Q`에는 해당 두 모듈·새 회귀·이 문서·검증 명령 링크만 반영했다. 같은 네 테스트 파일을 다시 실행해 18/18·skip 0·종료 0을 확인했다. 다른 미게시 배치/각주/파서 변경은 포함하지 않았으며 WASM 산출물도 교체하지 않는다.

실제 숫자 참조 문서의 도형 69는 SQUARE(`text_wrap=0`)·오른쪽(`text_flow=2`)이며, `flowWithText=true`·본문 제한 상대 기준을 함께 사용한다. 단순 TOP_AND_BOTTOM으로 변경하거나 감싸기 whitelist만 풀 수 없다. 재측정·제한 이동·본문/표/각주 충돌을 같은 예약에 연결하는 후속 구현이 남아 있다.
