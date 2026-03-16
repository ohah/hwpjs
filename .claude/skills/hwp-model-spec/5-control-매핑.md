# 5. Control 매핑 (머리글/꼬리말/각주/필드/북마크/자동번호)

## 5.1 머리글/꼬리말 (Header/Footer)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "head" / "foot" | `<header>` / `<footer>` | 직접 매핑 |
| 페이지 적용 | UINT32 속성 | applyPageType | BOTH/EVEN/ODD |
| 텍스트 폭 | HWPUNIT | subList@textWidth | 직접 매핑 |
| 텍스트 높이 | HWPUNIT | subList@textHeight | 직접 매핑 |
| 텍스트 참조 | BYTE | subList@hasTextRef | 직접 매핑 |
| 번호 참조 | BYTE | subList@hasNumRef | 직접 매핑 |
| 내용 | 문단 리스트 | subList > p[] | 직접 매핑 (재귀) |

## 5.2 각주/미주 (Footnote/Endnote)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "fn  " / "en  " | `<footNote>` / `<endNote>` | 공백 주의 |
| 번호 | (자동 계산) | num 속성 | 직접 매핑 |
| 내용 | 문단 리스트 | subList > p[] | 직접 매핑 (재귀) |
| 8바이트 예약 | BYTE[8] | 대응 없음 | HWP only |

## 5.3 자동 번호 (AutoNumber)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "autn" | `<autoNum>` (ctrl 내) | 직접 매핑 |
| 번호 종류 | 속성 bit (figure/table/equation 등) | numType | PICTURE/TABLE/EQUATION/... |
| 번호 형식 | 속성 bit | type | DIGIT/ROMAN_CAPITAL/... (NumberType) |
| 번호 값 | UINT16 | num | 직접 매핑 |
| 사용자 기호 | WCHAR | userChar | 직접 매핑 |
| 앞 장식 문자 | WCHAR | prefixChar | 직접 매핑 |
| 뒤 장식 문자 | WCHAR | suffixChar | 직접 매핑 |

## 5.4 필드 (Field)

### 공통 구조

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "%%%%" (필드 종류별) | `<fieldBegin>` + `<fieldEnd>` | 구조 차이 |
| 필드 종류 | 4글자 ASCII | type 속성 (문자열) | 값 변환 필요 |
| 속성 | UINT32 | editable/dirty 등 | 형식 다름 |
| 명령어 | WCHAR[] | parameters (하위 요소) | 구조 차이 |
| 필드 ID | UINT32 | fieldid | 직접 매핑 |
| 필드 시작 ID | (없음) | id | HWPX only |

### 필드 종류별 매핑

| HWP CtrlId | HWPX type | 설명 |
|------------|-----------|------|
| %dte | DATE | 날짜 |
| %ddt | DOC_DATE | 문서 날짜 |
| %hlk | HYPERLINK | 하이퍼링크 |
| %bkm | BOOKMARK | 책갈피 |
| %crf | CROSSREF | 상호 참조 |
| %fml | FORMULA | 표 계산식 |
| %clk | CLICK_HERE | 누름틀 |
| %smr | SUMMARY | 요약 |
| %usr | USER_INFO | 사용자 정보 |
| %pth | PATH_INFO | 경로 정보 |
| %mmg | MAIL_MERGE | 메일 머지 |
| %mem | MEMO | 메모 |
| %prv | PRIVATE_INFO | 개인 정보 |

### HYPERLINK 필드 파라미터

| 파라미터 | HWP 5.0 | HWPX | 비고 |
|---------|---------|------|------|
| 링크 경로 | 명령어 내 | Path (stringParam) | 직접 매핑 |
| 카테고리 | 명령어 내 | Category (stringParam) | URL/EMAIL/EX |
| 대상 타입 | 명령어 내 | TargetType (stringParam) | BOOKMARK/OUTLINE |
| 문서 열기 옵션 | 명령어 내 | DocOpenType (stringParam) | CURRENT_TAB/NEW_TAB |

### CROSSREF 필드 파라미터

| 파라미터 | HWP 5.0 | HWPX | 비고 |
|---------|---------|------|------|
| 참조 경로 | 명령어 내 | RefPath (stringParam) | 직접 매핑 |
| 참조 대상 종류 | 명령어 내 | RefType (stringParam) | TABLE/PICTURE |
| 참조 내용 | 명령어 내 | RefContentType (stringParam) | PAGE/NUMBER/CONTENTS |

### FORMULA 필드 파라미터

| 파라미터 | HWP 5.0 | HWPX | 비고 |
|---------|---------|------|------|
| 함수 이름 | 명령어 내 | FunctionName (stringParam) | SUM/AVG/PRODUCT |
| 함수 인자 | 명령어 내 | FunctionArguments (listParam) | LEFT/RIGHT/ABOVE |
| 결과 형식 | 명령어 내 | ResultFormat (stringParam) | %g / %.0f |
| 마지막 결과 | 명령어 내 | LastResult (stringParam) | 계산 결과 |

## 5.5 책갈피 (Bookmark)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "bkmk" | `<bookmark>` | 직접 매핑 |
| 책갈피 이름 | WCHAR[] | name 속성 | 직접 매핑 |

## 5.6 새 번호 지정 (NewNum)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "nwno" | `<newNum>` (ctrl 내) | 직접 매핑 |
| 번호 종류 | UINT16 | numType | PICTURE/TABLE/EQUATION |
| 새 번호 | UINT16 | num | 직접 매핑 |

## 5.7 쪽 번호 제어 (PageNumCtrl)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "pgct" | `<pageNumCtrl>` (ctrl 내) | 직접 매핑 |
| 속성 | UINT32 | pageStartsOn/visible | 직접 매핑 |

## 5.8 감추기 (PageHiding)

| 필드 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 컨트롤 ID | "pghd" | `<pageHiding>` (ctrl 내) | 직접 매핑 |
| 감출 항목 | UINT32 속성 | hideHeader/hideFooter/hideMasterPage/hideBorder/hideFill/hidePageNum | 직접 매핑 |

## 5.9 글자 겹침 / 덧말

| 요소 | HWP 5.0 | HWPX | 비고 |
|------|---------|------|------|
| 글자 겹침 | 컨트롤 (0x17) | `<compose>` | 직접 매핑 |
| 덧말 | 컨트롤 (0x17) | `<dutmal>` | 직접 매핑 |
