# HWP5 원본 단순 셀 나누기 Native 후보

`src/hwp5/edit/source_table_cell_split_service.zig`는 현재 관리 이력과 원본 셀 binding으로 검증하는 Native typed 경계다. `Service.capture`는 기존 Session의 `tableBindings`에서 실제 셀을 읽고 `Target`을 반환한다. `Service.apply`는 이 target과 줄·칸 개수를 받아 기존 `History.apply`에 `.split_source_table_cell` 명령 하나를 전달한다.

## 지원과 정책

첫 범위는 최상위 본문의 원본 비병합 직사각형 정적 표에서 물리 셀 하나를 나누는 것이다. 줄·칸은 1~63이며 유지 방향은 1, 활성 방향은 2~63이다. 총 논리 격자는 4096 이하로 제한한다. 기존 병합이 있는 입력 표, 여러 셀의 각각 나누기와 합친 후 나누기, 불균등 높이 유지 옵션은 후속 범위다. 분할 결과의 주변 span은 정확히 보존·재열기하지만 이 span이 있는 표의 추가 분할은 현재 거절한다.

원본 표 크기는 고정하고 선택 셀의 크기를 양수 정수 단위로 나눈다. 나머지는 앞쪽 조각에 하나씩 배분하는 후보 정책이다. 원래 문단 전체·글자 모양·문단 모양·style·instance ID는 첫 조각에 남기고, 나머지 조각은 첫 문단/첫 run 서식을 물려받은 빈 문단 하나를 가진다. 새 ID는 기존 파일 어댑터가 DocInfo와 모든 구역의 ID를 색인해 발급한다. 비선택 셀은 폭·높이·본문·서식을 유지하고 분할로 생긴 축을 가로지르는 span만 조정한다.

공식 HWP5 revision1.2의 표75/79/80을 레코드 구조 근거로 사용한다. 셀 본문과 속성 승계는 공식 셀 나누기 도움말을 따른다. 정수 나머지 배분은 위 후보 정책으로 명시한다. [HWP5 공식 명세](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.2.pdf), [공식 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/table/table%28divide%29.htm)

공식 spec6과 기존 observed8 원시 writer 경로를 검증한다. Session typed 경계는 기존 `tableBindings`의 observed8 정책을 명시적으로 사용한다. 길이나 버전으로 둘 중 하나를 추측하지 않는다. 보호 셀 판정은 기존 `CellAttributes`를 재사용한다. 보호 bit의 해석을 새 공식 명세 사실로 분류하지 않는다.

## 소유권과 원자성

Target은 현재 Session의 History mutation ticket, revision, 기존 `formatting_binding.State`의 session epoch 및 실제 section/table/list/행·열에 묶인다. 닫힘, 재열기 세대, foreign History, unmanaged protocol, poison, 진행 중 mutation, 외부 변경과 undo ABA를 거절한다. 요청 필드는 apply에서 다시 현재 Native binding과 대조한다. 이력과 lifetime은 호스트가 소유하며 lifetime을 성공적인 open/reopen마다 증가시켜야 한다.

새 Session 명령은 선택 구역에 기존 strict `source_policy.validate`, 다른 모든 구역에 `validateUnselectedStructureSection`을 적용한다. 선택 구역의 미지원 필드·제어를 거절한다. 원본 grid writer의 표 전체 보호·중첩·caption·cache·opaque child·확장·zone 거절도 재사용한다. 보류 생성 표와 cell background/resource remap 제한은 기존 Session 경로가 소유한다. private 원시 writer가 보존하는 비대상 opaque 레코드라도 typed service의 구역 정책에서 거절될 수 있다.

기존 불변 파일 준비, 현재 Section 재투영과 rebased source 교체 경로를 사용한다. 새 CFB나 임시 arena를 이력에 저장하는 별도 스택을 만들지 않는다. 새 문단·버퍼는 Session allocator가 소유하며 요청 반환 후 빌린 입력을 보관하지 않는다. 보호·예산 실패와 OOM은 기존 managed checkpoint rollback을 사용한다.

`source_table_grid`의 기존 command 입력은 optional로 확장되며 새 split 입력과 정확히 하나를 요구한다. 기존 네 grid 명령은 기존 공통 mapping을 사용한다. `source_table_grid_operation.zig`는 H5 전용 geometry 분기만 소유한다.

## 검증과 남은 연결

실행·해시·원본/결과 CFB와 독립 오라클은 `zig-out/verification/hwp5-source-cell-split-r1/ADOPTION-MANIFEST.json`에 고정한다. 생성 constructor로 파일을 저장한 뒤 새 Session으로 열어 원본 표로 편집한다. 비압축·압축, style/run 승계, 단일 revision, 저장 재열기·undo/redo, stale/foreign/닫힘, 보호·중첩·unknown, OOM 및 후반 예산 거절을 집중 검증한다. 외부 보호 fixture는 사용하지 않는다.

독립 Python 오라클은 프로젝트 CFB/record parser를 import하지 않고 MS-CFB와 공식 HWP5 framing을 직접 읽는다. 비대상 스트림과 메타데이터, 실제 셀 주소/span/크기, 원본 문단 원시 바이트와 신규 빈 문단·ID·run 승계를 검사한다. [MS-CFB 공식 문서](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cfb/53989ce4-7b05-4f8d-829b-d08d6148375b)

이 후보는 Native typed service와 Session/History 기반이다. 공개 WASM export·JS SDK·Core/Surface/UI 활성화와 실제 외부 문서/OS 입력은 다음 통합 단계다. HWPX R4 소스는 별도 동결 의존성으로 보존한다.

writer는 입력 record·문단을 검증하고 출력 논리 격자 `L=(R+a-1)(C+b-1)`를 순회한다. live 경로는 기존 tableBindings와 저장·재개방·checkpoint 비용을 포함한다. 기존 cell-size intent와 binding 대조의 반복 비용까지 포함한 전체 서비스 선형성을 이 집중 검증으로 주장하지 않는다.

## R2 공용 split 연결 후보

R2는 기존 `SPLIT_SOURCE_TABLE_CELLS_COMMAND`, opaque Surface 선택 증명과 소유 메뉴 등록, 같은 대화상자를 형식 어댑터로 재사용한다. `HeadlessEditor.getSourceTableCellSplitCapabilities()`와 SDK의 `sourceTableCellSplitCapabilities()`는 현재 binding 및 지원 profile을 반환한다. HWP5 profile은 `single-unmerged-source-cell`이며 `maxSelectedCells=1`, 병합 입력·합친 후 나누기·원본 불균등 높이 유지 지원은 false다. HWPX는 기존 직사각형 profile을 유지한다.

선택 증명은 현재 Native source binding의 모든 문단·격자·span 대조를 공유한다. HWP5는 표 전체가 비병합이고 선택 물리 셀이 하나일 때만 target을 발급한다. Core는 FIFO/IME 정리 후 상태·lease를 재검사하고 Native capability의 revision·format 및 선택 제한을 확인한다. SDK의 scope 비교와 Native의 open epoch/revision/non-rewinding serial 검사를 거친다.

Native optional export는 `hwp5_edit_source_table_cell_split_capabilities`와 `hwp5_edit_split_source_table_cells`다. 공용 scalar split 요청을 받아 HWP5가 지원하는 단일 셀·each·균등 분할 intent만 허용한다. 기존 formatting lifetime과 managed History를 사용하고 mutation 전에 view epoch를 예약한다. 기존 0/1/2/3 완료 처리와 postcommit refresh 경로를 재사용한다.

HWP5 대화상자는 지원 범위를 표시하고 합친 후 나누기와 높이 유지 옵션을 비활성화한다. 다중 선택은 메뉴 사유와 함께 거절한다. 후속 목표는 병합 입력, 여러 셀의 개별 분할, 합친 후 분할, 불균등 높이 유지다. 현재 profile의 제한은 전체 셀 나누기 목표에 남는 작업이다.

R2의 실제 WASM·Core/SDK·Vanilla Worker 메뉴·CFB 저장/undo/redo/재열기 및 Main params+bullet 회귀는 `zig-out/verification/hwp5-source-cell-split-r2/ADOPTION-MANIFEST.json`에 고정한다. 공개 배포와 최신 Main 진행분의 최종 합본은 별도 인수 단계다.

새 글머리표 정의 writer/query·HWP5 크기 권한·COW·parked history를 보존한 F 기준 R2 결합 및 직접 재검증은 [결합 후보 인수](hwp5-cell-split-integration.md)에 기록한다. frozen 단일 원본 셀 범위를 유지하며 Main의 채택·배포는 별도 게이트다.
