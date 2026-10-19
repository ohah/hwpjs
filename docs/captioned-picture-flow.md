# 그림 캡션과 본문·표의 복합 흐름

그림 원값과 문단 소속은 [캡션 API](hwpx-picture-caption-api.md)가 소유합니다. 이 문서는 페이지 배치의 별도 계약입니다.

## 책임과 불변식

- picture-page-reservations는 원래 그림 rectangle을 유지하고 캡션·간격을 포함한 flowRectangle과 별도 captionRows를 반환합니다.
- captioned-picture-body-layout과 reserved-picture-page-flow는 예약 영역에 맞춰 본문을 재측정합니다. body-row-sources와 reserved-body-row는 원문 범위·표 밴드·단 선언을 보존하며 인공 삽입 행을 본문 소비로 세지 않습니다.
- table-collision-footprints는 최종 셀 위치·바깥 여백·캡션 bounds에서 충돌 영역을 수집합니다. table-caption-page-projection과 multiple-table-page-layout은 실제 배치된 캡션 식별자·좌표를 전달합니다. 근거가 없으면 충돌 검사를 생략하지 않고 거부합니다.
- table-anchor-coverage는 정확한 원본 U+FFFC 앵커와 모든 셀의 실제 배치가 확인될 때만 coverageOnly 구간을 만듭니다. 렌더링 rows에 추가하지 않으며 일반 텍스트 누락을 숨기지 않습니다.
- drawing-wrap-page-policy는 본문 어울림의 추가 조건을 소유합니다. 축 정렬·캡션 부재·명시적 배치 플래그를 요구하고 공통 도형 paint 검사를 대신하지 않습니다.

## 검증 범위

기준은 main 0d6b3745에서 추출한 격리 소스와 SHA256 b59f67c71105c93e4745cd9d5b172d45636939ddc06b4b636e4ca2a1769271e2 WASM입니다. 기본 WASM은 교체하지 않았습니다.

실제 reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx는 고정 8px 측정에서4페이지·262행입니다. Worker 소속 전달·전체 배치·본문 입력·undo/redo·저장·독립 전체 XML 비교·재열기를 검사합니다. 한글의 원본 조판 동치나 실제 브라우저 픽셀 결과를 뜻하지 않습니다.

처음 전체 추적46경로 검사에서 sample-5017.hwpx가 IncompleteTableCaptionCollisionFootprint로 새로 거부됐습니다. 캡션 좌표 전달을 보완한 재검사에서는45개 페이지 배치와 암호 문서1개의 EncryptedDocument 거부를 확인했습니다. 암호 거부를 편집 지원으로 세지 않습니다. 이 검사는 모든45개 문단의 편집 검사가 아닙니다.

재현은 명시적 HWPJS_TEST_WASM과 node --test --test-concurrency=1로 다음 테스트를 실행합니다: captioned-picture-body, reserved-body-row, reserved-picture-page-flow, table-picture-reservation-check, table-anchor-coverage, drawing-wrap-page-policy, table-caption-page-projection, picture-caption-worker-layout, captioned-picture-worker-roundtrip (모두 tests/hwpx/ 아래 .test.mjs). 실제 브라우저 왕복은 [별도 도구](captioned-picture-browser.md)로 검증하며 이전 후보 결과를 이 소스에 소급하지 않습니다.

격리 소스의 집중21/21·skip0와 기존 인접 회귀는 별개로 계수합니다. 같은 소스의 실제 Chromium 왕복도 통과했습니다: Canvas 신뢰된 클릭·한글/이모지 prefix 입력·undo/redo·다운로드·독립 XML/ZIP 검사·저장본 재업로드, 그림6/6 해독. 실제 글꼴 측정은5페이지이며 고정8px의4페이지와 구분합니다. 화면에는 정렬 간격 미지원5줄과 도형 텍스트 넘침1줄 경고가 남습니다. 결과 폴더는 /var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-caption-canvas-QxGCfP, 저장본 SHA256 c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad입니다. 소유 세션 hwpjs-caption-canvas-82a541b44c4f의 inactive 및 전용 서버 종료를 확인했습니다. 기존 default 세션과 배포 서버는 변경하지 않았습니다.
