# 원본 인라인 표와 생성 표의 페이지 배치

`source-table-inline-measurement.mjs`는 원본 표의 기존 mixed-inline 정책·앵커 정책·셀 측정기를 재사용합니다. 원본 tableNode/listNode와 native 생성 identity/row/column은 별개입니다. 같은 수치9의 원본 노드와 문자열"9"의 생성 identity를 합치거나 임의 source 노드를 만들지 않습니다.

`created-body-flow-measurement.mjs`는 두 종류의 표를 같은 본문 행 예약에 연결합니다. 원본 표 셀은 기존 `layoutInlineTablePageContent`로, 생성 셀은 기존 생성 셀 layout으로 확정 위치에 투영합니다. 원문 제어 위치와 UTF-16 범위는 유지하고 원본 셀 문단 전체도 최종 coverage에 포함합니다. 본문/노트 조립과 같은 측정기를 쓰지만, 현재 원본 표+노트 조합은 노트 엔진의 기존 거부를 유지합니다.

`measureCreatedTableHost`의 `sourceTables`는 검증한 실제 원본 앵커·크기만 받습니다. source placeholder는 생성 placeholder 뒤로 이동하고 출처 없는/중복 위치·번호/숨김 앵커와 겹침은 거부합니다. 원본 표 자리 표시 행은 `sourceObjectAnchor`와 기존 `inlineTables` 메타데이터로 구분합니다. native 편집 위치·폭·coverage는 유지하되 표를 덮는 자리 표시 glyph를 그리거나 클릭 대상으로 삼지 않습니다. 이 처리가 없으면 셀 중앙 클릭이 원본 호스트의 U+FFFC 행으로 가는 실패를 실제 파일에서 재현했습니다.

같은 호스트의 조립은 단일 구역·단일 단의 기존 인라인 표를 대상으로 합니다. 캡션·부유 표·중첩 표·그림/도형 혼합·다단·쪽보다 큰 객체 등은 원래 지원 조건을 우회하지 않습니다. 별도 본문 호스트의 조립은 아래 source 엔진 위임 경로를 따릅니다. 잘못된/불완전한 소유권·source geometry·margin·셀 정보도 명시적으로 거부합니다. 모든 HWP5/HWPX fixture 또는 원본 한글 조판 완료의 뜻이 아닙니다.

## 실측과 반례

실제 RHWP 참조 `samples/task1763/cell_trailing_ls_expand.hwpx`(SHA256 `7fa0911cd7c713259fc3becbc6e3877aed5f04c53019d2677c53ba8c5563e2a5`)에서 원본 표 앞뒤에 새 표2개를 만들고 각 셀 emoji 입력·생성/원본 셀 hit·source 문단 불변·저장 재열기·4회 undo 원본 바이트·4회 redo 저장 바이트를 확인했습니다. 독립 Python ZIP/XML로 원본 표 전체 요소 불변, 표1→3개, 비대상 ZIP 멤버/목록 불변도 확인했습니다. 참조 fixture 자체는 수정하거나 제품 저장소에 복제하지 않았습니다. 실행 명령과 참조 파일 전제는 개발·검증 명령 문서가 소유합니다.

초기 표본 table-position은 캡션/부유 표가 있고 noori는 그림이 있어 기존 거부를 유지합니다. 최소 참조 tac-host-spacing/issue5593은 스타일 리소스가 없어 작성 요청의 resource 선택이 성립하지 않았으며 이를 허용하도록 native 검증을 약화하지 않았습니다. 따라서 이 파일들을 새 조합의 통과로 계수하지 않습니다.

게시 코드만 추출한 HEAD 의존성과 WASM `b1b2ba3250474ff6cda9294f57b91d42d7ddfa336db764626d20f1a69d3fc96d`에서 source worker/host·기존 host 측정/원문 제어/본문-노트/인라인 페이지/softline/노트 표의 정확한8파일25/25·실패/skip/cancel0·exit0입니다. 같은 새 Worker 검사는 수정 전 소스에서 UnsupportedCreatedTablePageObjects/블록 fallback으로 실패하는 부정 대조도 확인했습니다. source 노드9와 생성 identity"9"의 같은 위치 배치·입력 불변·중복/잘못된 위치·불완전한 source 거부도 별도 순수 반례로 검사합니다.

HWP5의 기존 본문/노트 생성 표 회귀1/1은 로컬 후보에서 별도로 통과했지만 실제 HWP5 원본 표와 새 표의 조합을 검증한 것은 아닙니다. 실제 브라우저/OS 입력은 이번에 실행하지 않았습니다. 기본 WASM과 데모 서버도 교체하지 않았습니다.

## 원본 객체와 별도 본문 호스트

`created-table-source-scene-layout.mjs`는 기존 표 호스트/셀과 겹치지 않는 본문 문단의 생성 표를 `table-body-content-layout.mjs`에 주입합니다. 원본 표·그림 배치/쪽 흐름은 기존 source 엔진이 계속 소유하고 생성 표가 있는 본문만 공통 whole-line 측정을 사용합니다. 새로 source geometry를 추측하거나 source 표를 생성 identity로 바꾸지 않습니다. 주입된 행의 rowCount에는 셀·번호 레이어도 포함해 전체 예산에서 차감하고 부분/미측정 성공은 거부합니다. 표 엔진의 다른 배치 경로가 콜백을 소비하지 않으면 MissingCreatedTablePageHost로 거부합니다.

원본 표 전용 호스트의 U+FFFC는 기존 source 엔진에서 텍스트 행 대신 표 셀로 표현됩니다. 실제 noori의5개 해당 문단이 텍스트 행0개인 것을 관측했습니다. `source-table-control-coverage.mjs`는 native table/host/unit 일치·중복 없음·모든 원본 listNode의 실제 box 존재를 확인한 제어 위치만 coverage 증거로 추가합니다. 화면용 가짜 텍스트 행을 만들거나 일반 텍스트 누락을 면제하지 않습니다. 이미 텍스트 행으로 표현된 제어는 중복 추가하지 않습니다. 잘못된 앵커/foreign owner/셀 box 누락은 거부합니다.

실제 추적 noori.hwpx에서 표5개·그림4개를 유지하면서 별도 본문 문단에 표1개/emoji 문자열을 만들고 새 셀 hit·원문 문단 불변·그림 flow owner 유지·저장 재열기·2회 undo 원본 바이트·2회 redo 저장 바이트를 확인했습니다. 독립 Python ZIP/XML은 원본 표5개와 그림4개 전체 요소, 비대상 멤버/목록 불변과 표5→6개를 검사합니다. 단순 저장 재열기를 조판 동치로 확대하지 않습니다.

게시 코드만 HEAD 의존성에 적용한 WASM b1b2ba32에서 새 scene/coverage·기존 source worker/host·본문-노트·인라인 페이지·softline의 정확한7파일16/16·실패/skip/cancel0·exit0을 확인했습니다. 같은 새 scene 검사는 수정 전 소스에서 UnsupportedCreatedTablePageObjects로 실패하는 부정 대조가 됩니다. ordinary 텍스트가 빠진 상태는 제어 coverage 증거만으로 통과하지 않는 순수 반례도 포함합니다. 이번 분리는 로컬 다단/종이 기준 표 배치/최소 셀 높이 확장에 의존하지 않습니다. 새 브라우저·디바이스와 기본 WASM/데모 승격은 없습니다.
