# 행마다 다른 표 셀 가로 경계

격리 게시 소스의 초기 새 원본 경계/실제 Worker6개와 기존 캡션/분할 문단7개가13/13·skip0입니다. 같은 WASM으로 추적46경로의 변경 전후 배치 상태·행 수·페이지 수를 비교해45개 paginated와 암호1개 예상 거부까지 결과 객체가 모두 일치했습니다. 초기 게시 추출 과정에서 구형 중첩 셀 경로의 HU 변환 import 누락을 검출해 유지했고, 정상 종료한 최종 감사만 통과 근거로 기록합니다. 전체 Worker 테스트 파일의 임시 복사본은 미게시 prototype 검사 모듈을 import해 격리 폴더에서 실행되지 않았으므로 통과로 계수하지 않습니다. 실제 원본 대조는 별도 `source-row-table-worker.test.mjs`로 검증했습니다.

적대적 리뷰에서 양수 셀 폭으로 이루어진 행별 표가 공통 열의 파생 해에서는 음수/0 열을 만들 수 있는 반례를 확인하고 직접 재현했습니다. 기존 uniform 오류 이름은 유지하면서 그 해에만 `NonPositiveSourceColumnSolution` reason을 추가해 행별 검증으로 전달합니다. 원본 음수 width 등 잘못된 입력은 기존 오류로 계속 거부합니다. 이 두 파생 해와 잘못된 원값의 음성 대조를 추가했습니다. 본문·중첩 표가 같은 selector를 사용하며 임의로 음수 열을0으로 보정하지 않습니다.

최종 격리 회귀는 원본 경계6개·실제 Worker1개·기존 캡션/분할7개로14/14·skip0입니다. 리뷰 수정 후46경로 감사도 다시 정상 종료했고 변경 전과 결과 객체가 모두 동일합니다. 정적 재리뷰에서도 이전 반례가 해소됐으며 추가 확정 결함은 발견하지 못했습니다. 정적 검토를 런타임 통과 수에 더하지 않습니다. 기본 WASM은 교체하지 않았습니다.

후속 기존 실제 Worker 회귀는7/7·skip0이며45개 페이지 배치·12표 파일/62표/689셀 문단이 유지됐습니다. 이는 현재 JS와 별도 caption 후보 WASM의 검사이며 격리 main 전체 소스 통과로 확대하지 않습니다.

다음 table1497의 원본 폭46027HU·가로 offset2421HU·바깥 여백141HU와 본문 폭48190HU를 독립 XML에서 확인했습니다. 호스트139의 paraPr77에는 switch/default 아래 intent=-5698과 lineSpacing PERCENT140이 있고 HwpUnitChar case는 intent=-2849입니다. 사용한 게시 후보 WASM은 해당 문단을 spacingFormat/alignment만 투영했습니다. PRIMARY 소스에는 이미 미게시 `paragraph_display_children.zig`와 선택 분기 reader 변경이 있으므로 이를 새로 작성하거나 덮어쓰지 않습니다. 원본 부재가 아니라 산출물의 미연결 필드임은 확인했지만, 누락된 음수 들여쓰기가 표 너비 오류의 직접 원인인지는 아직 확정하지 않았습니다. 문단/개체 기준과 signed 들여쓰기 의미를 확인하기 전에 너비 제한을 무조건 풀지 않습니다.

`source-table-row-horizontals.mjs`는 원본 HU 단위로 각 행을 덮는 셀을 논리 열 순서대로 연결합니다. 같은 열 주소가 모든 행에서 같은 물리 폭이어야 한다고 가정하지 않습니다. rowSpan 셀은 덮는 모든 행에서 같은 x/width를 가져야 하며 달라지면 거부합니다. 전체 논리 열의 누락·겹침·잘못된 소속/치수·중복 listNode를 거부하고 누적 rowSpan 작업량을 기본100만으로 제한합니다. 비어 있는 내부 열 경계를 균등 분배하거나 원본 폭을 수정하지 않습니다.

공통 열 모드는 기존 `sourceTableColumns`가 소유합니다. `table-source-horizontal-layout.mjs`는 그 정확한 복원이 성공하면 유지하고, 공통 경계가 충돌하거나 미정인 경우에만 완전한 행별 원본 경계를 시도합니다. 미게시1HU 보정 profile에 의존하거나 셀 폭을 조정하지 않습니다. `tableGrid`의 명시적 `sourceRowHorizontals:true` 모드는 같은 원본 계산기를 사용하며 `columns:null`로 공통 열 폭이 없음을 표시합니다. 전체 폭은 가장 넓은 행의 오른쪽 경계이고 셀 폭/시작은 각 셀 원값입니다. 일반 columnWidths 모드와 동시에 요청할 수 없습니다.

`measureTableCells`의 선행/최종 측정에 같은 모드를 전달합니다. 표 본문과 중첩 표도 이 선택 경계를 공유합니다. 셀의 세로 배치·분할·본문 어울림·저장은 이 모듈의 책임이 아닙니다.

실제 `issue6298/copay_cap_tac_table_leading.hwpx`의 XML table id1295981299(native node2369)는21행/9열입니다. 앞19행의 외곽은46598HU, 마지막2행은48013HU이며 마지막 열 폭은5006→6421HU입니다. 마지막 열의 x41592HU는 그대로입니다. declared width48013HU는 가장 넓은 두 행과 같습니다. 이는1HU 반올림 편차가 아닙니다. 독립 Python ZIP/ElementTree에서 직접 tr/tc의 주소/span/폭을 읽어 모든 셀 폭을 비교했습니다. 제품 파서 값을 기대값으로 다시 사용하지 않습니다.

`mise exec -- node --test tests/hwpx/source-table-row-horizontals.test.mjs`는5/5·skip0입니다. 행별 폭·병합/rowSpan·순서 독립·작업 예산·잘못된 입력·선행/최종 측정의 동일 셀 폭과 실제 XML을 검사합니다. 기존 표 조각 검사까지 함께 실행하면26개 중25통과·1실패입니다. 실패는 기존 inline object height 기대800/실측812이며 HEAD의 table-grid만 주입한 대조 실행에서도 같습니다. 이 실패를 지우거나 성공으로 계수하지 않습니다. 대조 로더는 `/tmp/hwpjs-row-grid-baseline.rrAG8I/loader.mjs`입니다.

새 경로를 현재 Worker/후보 WASM으로 실제 파일에 연결하면 기존 ConflictingSourceTableColumns를 통과하고 table1497/paragraph139의 TablePageWidthOverflow가 첫 제한으로 나옵니다. 전체 파일 성공·브라우저 조판 동치 또는 모든 픽스쳐 완료를 뜻하지 않습니다. 이 작업은 별도 실행 중인 caption API 게시 스냅샷에 포함되지 않습니다.
