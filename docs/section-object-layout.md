# 구역별 객체 배치와 좌표 합성

## 계약과 책임

`page-content-layout.mjs`는 여러 구역의 표·도형을 단일 구역 객체 조판기에 먼저 넘기지 않고 `layoutPageSections`로 분기합니다. 각 구역은 기존 단일 구역 조판기를 재사용합니다. 생성 표/주석 등 이 분기보다 앞에 있는 별도 경로와 모든 도형 정책까지 완료했다는 뜻은 아닙니다.

`sectionObjectContent`는 명시된 section으로 표·도형·그림·선·컨테이너·생성 표와 반복 영역 선언/조회 오류를 분리합니다. 구역마다 같은 node/paragraph ID가 있어도 합치지 않습니다. 알 수 없는 구역이나 잘못된 소속을 조용히 버리지 않습니다. 원본 배열과 항목은 변경하지 않습니다.

`section-layout-offset.mjs`는 세계 좌표와 페이지 ordinal 이동을 소유합니다. 변환 행은 로컬 x/y 대신 affine translation만 옮겨 이중 이동을 막습니다. 객체 rectangle/origin/caption bounds와 referenceBoxes도 함께 이동합니다. 선언의 시작 페이지와 영역 넘침 rectangle 역시 전역 페이지에 맞춥니다. 비유한 좌표·잘못된 페이지 ordinal·overflow를 거부합니다.

구역 합성은 child rows/페이지/객체의 소속·개수·예산을 확인합니다. 후속 구역의 잘못된 결과나 정책 충돌이 있으면 앞 구역의 부분 rows를 성공 결과로 반환하지 않습니다. 반복 영역 선택 정책과 확인된 선언 페이지 진단도 유지합니다.

## 독립 저장 검증의 문단 좌표

HWPX 공개 이벤트/API의 문단 ordinal은 문서 전체 기준이며 Worker는1을 뺀 표시 번호를 사용합니다. 구역이 달라졌다고 API 번호를 구역 내부 순번으로 바꾸지 않습니다. `tools/hwpx-anchor-prefix-oracle.py`는 기존 section-local 기본값을 유지하고 `paragraphScope: "document"`를 명시한 경우에만 앞 구역의 selected XML 문단 수를 독립적으로 차감합니다. 현재 이 도구는 canonical Contents/sectionN.xml 항목을 요구하며 누락/중복은 거부합니다. 별칭 패키지 순서를 추측하지 않습니다.

공통 실제 브라우저 왕복 helper는 Worker 좌표를 전달하므로 document 범위를 명시합니다. normal/-O 양쪽에서 전체 대상 section XML과 비대상 ZIP 항목/CRC/inventory를 확인하고 틀린 표식은 거부합니다. 도구의 좌표 수정이며 제품 API 번호 체계 변경이 아닙니다.

## 재현과 검증 (2026-10-20)

main ca56cb68의 분리 사본에서 로컬 초안의 선언 소속·객체 referenceBoxes·비유한 offset 반례3개가 모두 실패했습니다. 수정 뒤 통과했습니다. 실제 table2 Worker content를 두 표시 구역에 복제한 회귀는 이전 진입점에서 UnsupportedPageObjects였고 분기 수정 뒤 모든 셀/텍스트·구역별 물리 참조 상자를 보존했습니다. 이 복제 모델 검사는 실제 두 구역 파일의 파싱 증거로 세지 않습니다.

실제 lists.hwpx는 원본 두 구역 파일을 그대로 읽고 구역1의 일반 문단을 편집했습니다. 입력·undo/redo·독립 전체 XML/ZIP normal/-O 및 음성 표식·저장/재열기·원본 파일 불변을 확인했습니다. 첫 독립 검사 실패는 문서 전체 문단 번호를 section-local로 해석한 검증 도구의 paragraph index였고 제품 편집 실패로 분류하지 않습니다. 별도 미니 ZIP 두 구역 회귀도 document/section 범위의 정확한 대상과 잘못된 범위 거부를 검증합니다.

실제 브라우저 hzAwgj는 `--case=sections`로 lists.hwpx를 열고 구역1/표시 문단58을 검색·실제 포인터로 선택했습니다. 한글·이모지 입력·이력·다운로드·독립 저장·재업로드를 통과했고3페이지/64행·구역1 caret·표식 스크린샷을 확인했습니다. 최초 tlwCoG는 전 구역에서 검색어가 유일해야 한다는 도구 전제로 대상을 못 찾은 실패입니다. 구역 내부 유일성과 실제 검색 결과 순회를 검사하도록 고쳤으며 DOM selection/value로 성공을 주입하지 않았습니다.

복합 exam_social 원본은 수정 전 UnsupportedDrawingPageObjects, 수정 후 구역별 배치에 진입한 뒤 UnsupportedDrawingPagePolicy가 남습니다. 이를 문서 전체 배치 성공으로 세지 않습니다. 고정 글자 측정과 실제 Canvas 어느 쪽도 원본 한글 조판 동치를 증명하지 않습니다. 별도 전체 native 검증은 진행 중이며 이번 JS/검증 도구 수정에는 native 변경이 없습니다.

관련19파일48/48·skip0·exit0, build.zig 포맷, ReleaseSafe 빌드5/5가 통과했습니다. 추적 HWPX46경로의 고정 측정45배치/암호1거부도 유지했습니다. 처음 결합 실행의1실패는 분리 사본의 Git index 초기화 누락으로 인한 EmptyFixtureInventory이며 성공으로 세지 않습니다. GIT_DIR/WORK_TREE/별도 index를 지정한 재실행만48/48입니다. 재빌드424fa3ae의 실행·데이터/비디버그 custom section이 기본7512cca7과 같은 것도 확인했습니다.

기존 복합 셀/공백 꼬리말 모드 PuyNqN도 새 도구/이동 helper로 전체 왕복을 통과했습니다(16페이지/1,206행·그림8/8·기존 도형 텍스트 넘침1줄). 기본 WASM·서버는 바꾸지 않았습니다. 테스트 전용 브라우저/58886 서버는 각 실행의 finally에서 종료합니다.

최종 소스의 두 번째 구역 실제 브라우저 재실행 UUp8BB도 입력·이력·독립 저장·재업로드를 exit0으로 통과했습니다. 구역1/문단58·3페이지/64행이며 소유 브라우저 inactive와58886 listen 없음도 확인했습니다. 연결 문서4개의 상대 링크663개는 실제 경로가 존재합니다. 링크 존재를 전체 문서 내용 검증으로 세지 않습니다.
