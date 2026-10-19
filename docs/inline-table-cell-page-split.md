# 단독 인라인 표의 셀 경계 페이지 분할

`table-body-content-layout.mjs`는 원본에서 셀 나누기를 허용한 단독 인라인 표가 본문 높이를 넘을 때 기존 row-bands 계획을 선택합니다. `single-inline-table-host.mjs`의 소유권 판정을 공유하며 실제 문자·알 수 없는 앵커를 가진 혼합 호스트에는 적용하지 않습니다. 표·셀·페이지 치수나 원문을 줄이거나 삭제하지 않습니다. 캡션 예약이 있거나 page_break가 none인 표, 본문에 들어가는 작은 표는 기존 whole 계획을 유지합니다.

`table-row-bands.mjs`가 병합 셀이 가로지르는 경계를 묶으므로 셀 내부를 임의로 자르지 않습니다. 한 밴드 자체가 페이지보다 크면 계속 거부합니다. 셀 내부 줄 분할이나 한글 조판 동치 완료는 아닙니다.

`inline-table-page-placement.mjs`는 각 page/column 인스턴스의 실제 열 상자를 기준으로 기존 단독 표 수평 배치를 재사용합니다. 셀·중첩 위치 소유 행·그림을 같은 이동량으로 옮기고 다른 구역/표는 그대로 둡니다. 셀 나누기 동의 없는 여러 인스턴스, 잘못된 페이지/열 번호, 소속 인스턴스가 없는 중첩 상자·행·그림은 거부합니다. 입력 객체를 수정하지 않습니다.

## 재현과 검증 (2026-10-20)

분리 main 9db0f933의 실제 copay 브라우저 첫 실패는 구역0/문단225의21행 인라인 표 node2369였습니다. 측정 whole 예약940.0667px가 본문933.5733px를 넘어 UnsupportedPageRow였습니다. XML의 pageBreak=CELL과 treatAsChar=1을 확인했습니다. 페이지 분할 선택만 고치면 수평 배치에서 UnsupportedSplitInlineTable이 되었고, 인스턴스별 배치까지 연결하면 다음 별개 제한 UnsupportedPageAreaObjects에 도달했습니다. 본문 표 수정으로 문서 전체가 성공했다고 집계하지 않습니다. 각 진단 브라우저와58886 전용 서버는 finally에서 종료했습니다.

새 실제 Worker 회귀는 원본21행 표와 셀 병합 정보를 독립 Python XML로 대조하고, 해당 표/셀 문단만 분리한 입력을 고정 폭8px·높이40px 측정으로 여러 페이지에 배치합니다. 모든 셀 상자가 한 번씩 남고 병합 셀이 같은 페이지에 있으며, 모든 셀 문단의 텍스트가 완전히 이어지고 원본 content가 불변인지 확인합니다. 이 인공 측정은 위 실제 브라우저940px나 원본 한글 글꼴 측정과 별개입니다. none 정책과 잘못된 전체 높이 병합은 거부합니다. 변경 전 분할 선택으로 같은 양성 검사를 실행하면 UnsupportedPageRow로 실패합니다.

`HWPJS_TEST_WASM=/absolute/hwpjs.wasm node --test --test-concurrency=1 tests/hwpx/inline-table-split-body.test.mjs tests/hwpx/inline-table-split-placement.test.mjs tests/hwpx/inline-table-page-placement.test.mjs tests/hwpx/single-inline-table-host.test.mjs tests/hwpx/inline-table-host-anchors.test.mjs`로 검사합니다. 참조 파일 누락은 명시적 skip이며 전수 성공으로 세지 않습니다. 이번 분리 검사에는 copay 및 carried-anchor 원본을 실제 복사했습니다. WASM7512cca7(실행 내용30434b54 동일)을 사용하며 native 코드는 변경하지 않았습니다.

위 다섯 파일10/10·skip0·exit0과 build.zig 포맷 검사가 통과했습니다. 첫 실행9pass/1skip은 carried-anchor 미복사였으며 성공10개로 집계하지 않습니다. 여러 페이지/같은 페이지의 서로 다른 열·그림 동반 이동·다른 구역 불변·잘못된 페이지/열/미소속 중첩 상자·그림 거부도 포함합니다. 실행 중인 별도 native 전체 테스트나 머리말/꼬리말 객체의 전체 편집 완료를 대신하지 않습니다.
