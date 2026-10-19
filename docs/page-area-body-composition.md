# 머리말·꼬리말과 본문 합성

## 책임

page-area-ownership.mjs는 문단과 표·도형·그림의 명시적 소속을 따라 본문과 반복 영역을 분리합니다. 배열 순서나 문단 번호의 연속성으로 조상을 추측하지 않습니다. 중복 식별자·잘못된 식별자·누락 소유자·소속 순환을 거부합니다. 표 셀은 listNode와 원본 셀의 paragraph 목록도 일치해야 합니다.

page-area-body-composition.mjs는 분리된 본문을 기존 페이지 조판기로 계산한 뒤 그 결과의 실제 페이지에 반복 영역을 합성합니다. page-content-layout의 표·도형 조판보다 먼저 이 경계를 적용하므로 머리말의 top_level=false 문단이 표 본문의 UnsupportedPageFlow로 섞이지 않습니다. 본문 rowY/minimumRowPage 콜백을 그대로 전달합니다. 영역 반복의 글자 측정·홀짝/숨김·수직 정렬 규칙은 기존 page-area-flow.mjs가 계속 소유합니다. 이전 plain 본문 전용 합성 블록은 제거해 중복 구현하지 않습니다.

유효 페이지 번호는 명시적 배열 또는 모든 영역에서 같은 page_number_source로만 결정합니다. 누락·범위·페이지 개수 불일치와 불완전한 본문/행 예산 소진은 거부합니다. 본문 rows/boxes/개체 식별자는 변경하지 않고 반복 행을 추가합니다.

영역 안 표·도형·그림·선·컨테이너의 투영은 아직 이 게시 경계에서 지원하지 않습니다. UnsupportedPageAreaObjects로 거부하며 해당 개체를 텍스트로 생략한 성공으로 바꾸지 않습니다. 꼬리말 정의가 여러 개인 문서의 전환 위치도 아직 완료하지 않았습니다.

## 검증

87684af7 기반 격리 사본에서 HWPJS_TEST_WASM=/tmp/hwpjs-caption-api-publish.R4bJyL/install/bin/hwpjs.wasm을 명시했습니다(SHA256 b59f67c71105c93e4745cd9d5b172d45636939ddc06b4b636e4ca2a1769271e2). 새 native 문단 분기 후보와 이 JS 변경의 근거를 혼합하지 않습니다.

tests/hwpx/page-area-body-composition.test.mjs는 소속 분리·본문 표 유지·콜백 전달·번호·예산·실패 전파·개체 생략 방지·순환과 잘못된 식별자를 검사합니다. page-area-flow.test.mjs는 반복 문단의 동일 식별자·페이지별 caret/선택/탐색·홀짝·숨김·원본 불변·넘침/중복 owner를 검사합니다.

실제 headerfooter.hwpx의 page-area-worker-layout.test.mjs는 본문 분할·한글/이모지 입력·undo/redo·저장·재열기 후에도 머리말/꼬리말 원문과 페이지 소속이 유지되는지 확인했습니다(1페이지·반복 영역2행). 독립 저장 oracle이나 실제 브라우저 결과를 대신하지 않습니다. 위 검사와 기존 실제 캡션 Worker 검사를 합쳐9/9·skip0입니다. 마지막 예산·빈 페이지 보강 후 순수7/7도 다시 통과했습니다.

추적 HWPX46경로의 별도 페이지 감사는45배치·암호1거부이며 행/페이지 수가 이전 감사와 같습니다. 모든45개의 모든 문단 편집 성공이나 한글 원본 조판 동치는 아닙니다.

참조 copay_cap_tac_table_leading.hwpx는 기존 진입점에서 머리말/꼬리말4문단이 표 본문에 섞이는 오류를 재현했습니다. 정확히 소속을 분리한 본문에서도 TablePageWidthOverflow가 남습니다. 추가로 꼬리말2정의 중 하나는 그림2개를 소유합니다. 둘 중 하나를 임의로 삭제하거나 선택해 전체 문서 지원으로 세지 않았습니다. 문단 서식 분기 누락의 native 수정·전체 검증은 별도 미게시 작업입니다.

재현은 명시적 HWPJS_TEST_WASM과 node --test --test-concurrency=1로 page-area-body-composition.test.mjs, page-area-flow.test.mjs, page-area-worker-layout.test.mjs, picture-caption-worker-layout.test.mjs를 실행합니다(모두 tests/hwpx/). 기본 WASM/기존 배포 서버는 교체하지 않았습니다.
