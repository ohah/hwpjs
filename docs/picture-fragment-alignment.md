# 그림 회피 조각의 정렬·진단 소유권

JS 표시 계층 수정입니다. 기본/10001 후보 배포 반영 여부는 별도로 확인하며 과거 화면 결과로 소급하지 않습니다.

## 재현된 원인

4d9f9e68의 실제 issue5543 원본을 고정8px 문자 측정으로 배치하면0기반 문단30의5줄이 UnsupportedAlignmentControl로 표시됐습니다. 개체 표식은 첫 줄에만 있는데 나머지 글자 조각도 같은 경고를 가졌습니다. measureReservedBodyRow/positionedRowFragments가 원본 carrier를 복사하면서 경고를 유지했고, measurePicturePageTextLine 및 pictureParagraphFlow는 새 조각에 공통 alignTextRow를 호출하지 않았습니다. 경고 과집계와 실제 정렬 누락이 함께 있었습니다.

## 책임 분리

picture-fragment-alignment.mjs가 기존 paragraphLineGeometry의 오른쪽/가운데 위치와 공통 alignTextRow의 간격을 조각별로 조립합니다. 두 그림 흐름 경로가 이를 공유하며 native 원문/저장값/UTF-16 주소는 바꾸지 않습니다. positionedRowFragments는 carrier의 alignmentUnavailable을 버리고 새 fragment 진단만 전달합니다. 진단을 지우는 대신 조각별 실제 정렬/미지원 여부를 재계산합니다. 탭·개체를 포함한 조각은 기존 UnsupportedAlignmentControl 정책을 유지합니다.

reserved-body-row는 표 경계 등으로 자른 임시 text의 끝을 실제 문단 끝으로 착각하지 않도록 paragraphEndUnit을 전달합니다. 문단 마지막 줄과 중간 band 마지막 줄을 구분하며 lastLine 규칙을 복제하지 않습니다.

line-visible-end.mjs는 공통 정렬과 조각 검증이 공유하는 후행 ASCII 공백/CR/LF 제외 경계입니다. 첫 실제 회귀에서 정렬 후 후행 공백이642.53px 줄의650.53px까지 나가 InvalidPositionedRowFragments로 거부됐습니다. 글자 영역은 여전히 줄 폭 안에서 검사하고 후행 공백의 좌표만 기존 공통 정렬과 같은 의미로 허용합니다. 다른 글자 넘침/비유한 좌표를 허용하도록 폭 검사를 없애지 않았습니다.

## 후보 데모 반영

ef389466 게시 후 기존 후보8082/10001만 새 고정 화면 사본으로 교체했습니다. PID5395 listener/명령을 확인한 뒤 종료하고 새 PID47996을 시작했습니다. WASM은 기존 검증8c52c744 그대로이며 기본8080 서버는 교체하지 않았습니다.10001에서 새 조각 정렬·공통 정렬·visible-end 세 소스의 응답 해시가 사본과 일치했고 예제107개 HEAD가 모두200입니다.

실제10001의 연쇄 SUM fixture 선택도 성공했습니다. hwpjs-fixture-profile-zAoC3D HAR,5쪽·정렬 미지원1줄·도형 넘침1줄·그림6/6이며 소유 브라우저 inactive를 확인했습니다. 클릭→두 RAF 약2976ms, Worker post→reply2750ms입니다. 이는 조판 표시 수정이며 수식 최적화 WASM을 아직 반영하지 않아1.68초 후보 성능과 혼동하지 않습니다. same-server Mac의 단건이며 사용자의 WAN/원본 조판 동치 보장이 아닙니다.

주소: https://macstudio.tailed42f2.ts.net:10001/web/preview/index.html (tailnet only).

## 회귀 검증 기록

### 깨끗한 게시 사본 검증

이 사본의 실제 Chromium도 hwpjs-caption-canvas-QyYe0c에서 입력·이력·독립 저장·재업로드를 통과했습니다. 고정8c52c744,5쪽·정렬 미지원1줄·도형 넘침1줄·그림6/6, 저장c52f341a…이며 소유 브라우저 inactive/감사 서버 종료를 확인했습니다. Worker 해시는 게시 기본e0dac171…로 앞선 다른 후보6a0601b6…와 구분합니다. 수식/선언 기능의 미게시 Worker를 검증에 끼워 넣지 않았습니다.

4d9f9e68의 별도 archive에 이 JS7파일과 새 회귀2개·문서/검증 목록만 반영했습니다. 수식 묶음·새 선언 API/Worker는 포함하지 않았으며 native는 고정8c52c744를 사용했습니다. 동일 집중6파일38/38·skip0·5.9초를 다시 통과했습니다.

HWP5는 추적 CFB55개 전부 로드/원본 불변,42배치/13미지원(표 source9·page source2·section extension1·section numbering1)입니다. 이전 게시 사본과 같은 WASM으로 파일별 state/error/page 수를 대조해 전부 동일했습니다. HWPX도 두 사본의 추적46경로에서45배치/암호1거부, 파일별 state/error/page/row 수가 모두 같습니다. HWPX content와 입력 bytes의 비변경도 확인했습니다. 이 비교는 고정8px 측정의 기존 배치 상태 유지이며 모든 문서의 원본 조판 동치나13미지원 해결을 뜻하지 않습니다. 새로운 x 좌표의 정렬 동작은 별도 숫자 회귀가 검증합니다.

새 picture-fragment-alignment.test.mjs의 최초4반례는 게시 소스에서4/4실패, 수정 소스에서4/4통과했습니다. 독립 숫자 간격, emoji grapheme, 자연 마지막 줄/계속 band, carrier 진단 비전파, 실제 control의 미지원 유지입니다. 후행 공백만 허용하고 글자 폭 초과/Infinity를 거부하는 회귀를 추가한 현재 집중3파일은15/15·skip0입니다.

이전 전체 집중6파일은37/37·skip0이며 picture-inline/line-alignment의 기존 로컬 회귀를 격리 폴더에 명시적으로 복사한 뒤 실행했습니다. 첫 실행은 해당 두 파일이 없어 Node가 조용히 제외했고4개만 실행했으므로31개 통과 증거로 쓰지 않았습니다. 두 로컬 회귀 파일은 이 수정의 게시 대상에 임의 포함하지 않습니다.

picture-fragment-alignment-reference.test.mjs는 실제 원본과8c52c744 WASM으로5쪽·282행·진짜 control1줄/일반 글자 조각 경고0·content 불변을 확인했습니다. 기존 caption Worker 회귀도 통과했습니다. 임시 좌표 진단으로 실제 후행 공백을 확인한 뒤 출력 코드를 제거했습니다. 실제 브라우저 및 최종 고정 소스의 넓은 재검증은 별도 기록합니다. 이는 공통 시스템 글꼴/grapheme 정책 연결이며 한글 원본 조판 동치 보장이 아닙니다.

최종 소스6파일 재실행은38/38·skip0·5.8초입니다. 실제 Chromium도 같은8c52c744 WASM과 수정 JS에서 Canvas 포인터·한글/emoji 입력·undo/redo·독립 XML/ZIP normal/-O 및 음성 marker 거부·다운로드·재업로드를 통과했습니다. hwpjs-caption-canvas-oeAJYl 산출물에서5쪽·정렬 미지원1줄·도형 넘침1줄·그림6/6이며 저장 SHA256 c52f341a5fbd58ea4d6db7e716138fa2888fdbcec45e072fad0db13ba1b45fad입니다. 소유 브라우저 inactive 및 감사 서버 종료를 확인했습니다. 이전 미수정 화면의5줄을 실제 수정 화면의1줄과 구분하며 경고를 전부 숨기지 않았습니다. 도구의15개 source hash는 전체 import closure 동결의 증명이 아니므로 별도 깨끗한 게시 사본 확인은 남습니다.
