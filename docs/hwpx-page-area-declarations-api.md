# 현재 머리말·꼬리말 선언 좌표 API

## 계약과 책임

선택적 native ABI는 hwpx_edit_page_area_declarations(section)이며 기존 output_ptr/len/free를 재사용합니다. 각 동기 요청에서 현재 표시 문단과 원본 선언 identity를 연결합니다. 원본·편집 이력·캐시를 변경하지 않습니다. 생성된 암시적 continuation은 원본 선언을 중복 반환하지 않으며 명시적으로 materialize된 선언은 현재 좌표를 반환합니다.

JS editor.pageAreaDeclarations(section)는 배열 {paragraph,sourceElement,sourceControl,unit,affinity}를 복사해 반환합니다. section은0기반, paragraph는 section.first_paragraph를 포함한 문서 전역1기반이며 구역 안에서1로 다시 시작하지 않습니다. unit은 현재 UTF-16 좌표입니다. affinity는 left/right입니다. source identity는 저장 후 영구 ID가 아니므로 편집·이력·재열기 사이에 오래 보관하지 않습니다. 단순 좌표 조회이며 선언 적용 페이지나 홀짝 우선순위를 계산하지 않습니다.

decoder는 최대100000개·u32 필드·1기반 문단 순서·중복 sourceElement·sourceControl<sourceElement·affinity를 확인합니다. 조회 실패는 오류이며 오래된 좌표로 대체하지 않습니다. ABI가 없는 기존 WASM에서는 HwpxPageAreaDeclarationsAbiUnavailable을 명시적으로 반환합니다.

## 검증과 게시 범위

실제 headerfooter 문서의 선언 소유 문단 split·undo/redo·저장 재열기와 실제 copay 표 안 선언의 host 좌표·소유 영역 문단 구분을 검사했습니다. wire 반례와 구형 기본 WASM 거부를 포함한4/4·skip0입니다. native 구현은 수식 묶음 조회와 함께 고정 tree6da11f0의 전체 native4157pass/1skip·exit0에서 검증됐습니다. 게시 전 깨끗한 main 사본의 native 차이0·fmt 통과와 같은5f3baacd artifact/구형 baseline의 두 API 파일8/8을 확인했습니다.

Worker attachment·물리 페이지 바인딩·선택 정책·Canvas 합성은 이 API 게시 범위와 구분합니다. 기본 WASM 배포나 원본 한글 조판 동치를 완료했다는 주장이 아닙니다.

## Worker 연결의 추가 검증

Worker 연결 게시 전 현재 main의 분리 사본에서 통합663cc534 후보와 구형8c52c744 baseline을 명시한 두 API/Worker 파일은7/7·skip0을 통과했습니다. 참조 경로와 Git inventory가 없는 최초 사본 실행은 환경 오류로 실패했으며 이를 통과로 계수하지 않습니다. 게시 범위는 응답 연결·회귀·gate뿐이고 물리 페이지 선택/Canvas 합성의 미게시 변경은 포함하지 않습니다.

`tests/hwpx/page-area-declarations-worker.test.mjs`는 응답마다 구역을 한 번 조회하고 문서 전역1기반 문단을 Worker 전역0기반으로 변환하는 연결을 검사합니다. 구형 ABI는 기존 응답 형태를 유지합니다. 신규 ABI의 조회 실패는 해당 구역 오류로 남기며 이전 좌표로 대체하지 않습니다.

2026-10-20 작업 트리에서 명시적5f3baacd 후보로 추적46개를 대조했습니다. 45개 열기와 암호 문서1개 거부가 기존 경로와 같았으며, 새 선언/오류 필드 외 응답 전체가 일치했습니다. 실제 headerfooter의 분할·undo/redo·저장/재열기 좌표도 검사했습니다. 추가 회귀는 같은 응답 객체를 재사용하더라도 이전 좌표와 오류 배열이 남지 않고 원본 조회 행이 변경되지 않는지 검사합니다. 이 결과는 Worker 응답 계약 검증이며 물리 페이지 적용·전체 편집·기본 배포 완료 증거가 아닙니다.
