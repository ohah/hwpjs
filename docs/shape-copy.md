# 모양 복사: 현재 문서의 지원 항목

기존 편집 메뉴와 도구상자의 ‘모양 복사’를 사용한다. 새 최상위 메뉴나 우클릭 항목을 추가하지 않는다. [공식 도움말](https://help.hancom.com/hoffice/multi/ko_kr/hwp/format/quick_format/quick_format.htm)의 커서에서 기억→대상 블록에서 같은 명령으로 적용하는 흐름을 따른다. 웹 단축키 안내는 [한컴 공식 답변](https://forum.developer.hancom.com/t/alt-c/1301)에 있지만, 이 변경은 새 단축키를 등록하지 않는다.

## 지원 범위와 사용자 흐름

본문 모양 복사는 현재 문서의 일반 본문을 대상으로 한다. 원본 글자 뒤에 커서를 두고 실행하면 ‘본문 모양 복사’ 창에서 글자·문단·둘 다를 고르고, 복사할 지원 항목을 직접 선택한다. 선택 전에는 복사를 실행하지 않는다. 현재 선택 그룹 밖의 항목과 체크하지 않은 항목은 복사하지 않는다.

지원 항목은 글자 크기·굵게·기울임·색, 언어별 글꼴 이름·장평·자간·상대 크기·위치, 밑줄·취소선·음영·효과·그림자·테두리/배경과 문단 정렬·여백·간격·격자·테두리 연결·테두리/배경·기존 문자 글머리표다. 목록에 있다고 항상 쓸 수 있는 것은 아니다. Native capability와 원본 조회가 known인 항목만 선택할 수 있고, 조회값이 현재 쓰기 enum에 없으면 사유와 함께 비활성화한다.

복사 후 대상 본문을 블록으로 선택해 같은 명령을 다시 실행한다. 대상의 최신 capability와 필드별 writable를 다시 확인해, 선택한 항목만 한 APPLY_FORMATTING_PATCH_COMMAND로 적용한다. 미확인 값을 기본값으로 채우거나 일부 setter를 순서대로 실행하지 않는다.

셀 테두리·배경·대각선의 선택형 복사는 [셀 모양 복사](cell-shape-copy.md)의 별도 계약을 따른다. 스타일 이름/참조, 탭·문단 번호·개요, 나머지 셀 속성과 다른 문서로 옮기기는 지원하지 않는다. 이 제한은 창에서 보이며 글자·문단 전체 모양 복사로 표시하지 않는다. 공식의 문서 간 기억 기능이나 모든 셀 모양·조판 동치가 완료된 것은 아니다.

## 권위와 수명

Core의 canonical 선택 검증과 createParagraphSelection이 대상을 소유한다. 기존 typingSourceSpan으로 커서 직전 scalar를 관측하되 실제 커서를 옮기지 않는다. queryFormatting의 Native DTO만 읽으며 UI가 Native reference나 글자 서식 모델을 만들지 않는다.

임시 저장소는 선택된 값의 소유된 불변 복제본과 Core 문서 token뿐이다. 문서/generation이 바뀌면 폐기하고, style/resource ID를 다른 문서의 권위로 재사용하지 않는다. 폰트는 언어별 이름으로 전달한다. 기존 글머리표 ID도 같은 문서 안에서 Native가 다시 검사한다.

원본 캡처와 대상 적용의 await마다 같은 EditorState 및 active guard를 확인한다. capability/query의 session·revision을 대조하고 적용에는 현재 stateVersion의 선택 fence를 넣는다. Core/Native의 readonly·owner·FIFO·이력·저장 권위를 그대로 사용한다. 별도 permission cache나 mutable 문서 모델은 없다.

입력 조합과 key229 구간에는 기억/적용/닫기를 억제한다. 오래된 선택, 문서 교체, 비활성 모달과 폐기는 쓰기 전에 거부한다. 성공과 refresh-required를 구분하고, 적용되지 않은 요청을 성공으로 알리지 않는다.

## 검증 경계

집중 검사는 명시한 정상 SDK의 Core/runtime과 기존 WASM·Noori HWP5/HWPX의 해시를 확인한다. source/UI가 그 Core와 동일한 module identity인지도 검사한다. fixture helper는 ABI hook이나 projection adapter를 넣지 않는다.

각 형식의 글자·문단·결합 복사는 한 Native 이력, 조회값, 선택하지 않은 항목, undo/redo 바이트, 저장·재열기를 비교한다. 전체 선택 가능한 known 항목 조합과 readonly·문서 교체·stale/ABA 반례도 별도 검사한다.

모달 검사는 실제 소스 도구와 정상 SDK/Native에 통제된 Node DOM을 연결한다. key229 red→green과 composition·취소·선택 변경, 실제 복사→적용 경로를 검사한다. DOM/IME 이벤트 모형은 실제 브라우저·OS IME·화면·공식 모달 외형 동치의 증거가 아니다.

Native879의 공개 AutoSize 세대와 Native464의 별도 private acceptance를 구분한다. 새 Native 컴파일이나 ABI는 필요하지 않으며, 다른 Native 세대의 성공을 자동으로 승계하지 않는다. 실제 GUI와 배포는 별도 검증이다.

## 남은 목표

현재 지원 항목 선택형 범위가 최종 모양 복사의 범위를 대신하지 않는다. 글자·문단 전체 모양, 글자/문단 스타일, 탭·번호·개요, 아직 지원하지 않는 셀 속성과 문서 간 복사는 backlog로 유지한다. 각 대상의 원본 조회·portable 표현·원자 적용 권위를 확보한 뒤 별도로 연결하며, 미지원 값을 기본값으로 채우거나 여러 writer 호출을 한 거래처럼 안내하지 않는다.
