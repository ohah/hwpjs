# XML 속성의 정규화 동일 뷰

`xml.attribute_value.Value.borrowedNormalizedUtf8`는 UTF-8이며 엔티티·탭·CR·LF가 없는 경우에만 원본을 빌려 반환합니다. 빈 문자열도 유효한 뷰입니다. UTF-16, 문자 참조, XML 공백 치환이 필요한 값은 null이며 기존 `toUtf8` 디코더를 사용합니다. 원본보다 오래 보관할 수 없으며 소유 배열로 해제하지 않습니다. 이 함수는 XML 파싱·유효성 검사를 대체하지 않습니다.

HWPX `table_xml_fields`의 unsigned/margin/boolean은 이 뷰에서 기존 `xml_values` 판정을 그대로 호출합니다. 별도 숫자 파서를 만들거나 0/부재·범위를 바꾸지 않습니다. 최대 길이는 기존 정규화 UTF-8 바이트 수 기준이며 동일 뷰에서도 먼저 검사합니다. 세 함수는 scalar만 반환하므로 빌린 포인터가 호출 밖에 남지 않습니다.

## 검증

같은 분리 소스와 후보로 Chromium에서 `table-bug.hwpx`를 파일 선택해490문단·측정17페이지를 열었습니다. 편집 시작 후 Canvas를 실제 클릭하고 빈 두 번째 문단에 `검증😀`를 키보드 입력했으며 caret `0:1:4`, 접근성 텍스트와 Canvas 화면의 동일 입력, undo/redo 뒤 복원을 확인했습니다. 다운로드 버튼 활성화까지 확인했지만 이 실행에서 다운로드/재업로드는 하지 않았습니다. 수집된 브라우저 오류는 없었고 사용한 agent-browser 세션·임시 서버는 종료 확인했습니다. 자동화된 Chromium 키보드 입력이며 물리 OS IME·전체 객체/페이지 조판 동치 검증이 아닙니다.

ReleaseSafe WASM 빌드와 실제 후보(`27c74da9a944b41c5596dbf743c7dc7332333b7ea78d1ada95c1a9d93b9cb379`)의 JS/Worker 회귀4/4도 skip 없이 통과했습니다. table-bug의 본문·셀·도형7문단48편집, 의료 장비 문서의 셀3문단21편집에서 시작/중간/끝 삽입·교체·끝 삭제, 독립 전체 XML/ZIP oracle 두 모드, 저장 재열기·undo/redo, 잘못된 기대 텍스트 거부를 확인했습니다. 행 최소 높이의 UI/Worker 검사도 포함하며 실제 브라우저 검사는 아닙니다. 전체 plain-leaf 문단 검사는 별도 실행 중으로 이 표본 통과와 구분합니다.

이번 변경만 분리한 main 기준 ReleaseSafe 5/5, Debug 4/4가 통과했습니다. 13개 입력을 UTF-8/UTF-16LE/UTF-16BE로 각각 파싱하고 0..11바이트 제한에서 기존 디코더의 값·오류와 대조했습니다. 부호·음수0·32비트 경계·범위 초과·빈 값·불리언·숫자 참조·참조 공백·CRLF/탭을 포함합니다. 일반 숫자 뷰는 fail_index=0 할당자로도 성공하고 할당 횟수0입니다. 실제 셀의 부재/0/엔티티/이름공간·중복 거부와 전체 할당 실패 검사도 통과했습니다.

실제 `table-bug.hwpx`의 동일 조회는 변경 전24,099회→변경 후19,395회 할당, 17개 표·490개 문단으로 측정했습니다. 단계별 문단 뷰16,918회는 동일하며 셀 연결은6,952회→2,328회입니다. 전체 응답 시간이나 전체 픽스쳐의 향상율을 뜻하지 않습니다. 기존 전체 native 실행은 이전 소스에서 계속 실행 중이며 이 집중검사의 통과로 대체하지 않습니다.

재현: `zig test src/root.zig -O ReleaseSafe --test-filter 'normalized attribute scalar' --test-filter 'HWPX display cell' --test-filter 'HWPX placement allocation measurement'`. Debug 값·오류/할당 실패 검사는 마지막 측정 필터 없이 실행합니다. 브라우저 조판·모든 편집/UI 완료와 구분합니다.
