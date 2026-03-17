# 뷰어 아키텍처 및 확장 계획

## 뷰어 모듈 구조

`crates/hwp-core/src/viewer/` 디렉토리는 다음과 같이 구성됩니다:

### 공통 Core 모듈 (`viewer/core/`)

모든 뷰어에서 공유하는 파싱 및 처리 로직을 제공합니다:

- **`renderer.rs`**: `Renderer` trait 정의
  - 각 뷰어가 구현해야 하는 인터페이스
  - 텍스트 스타일링, 구조 요소, 문서 구조, 특수 요소 렌더링 메서드 정의
- **`bodytext.rs`**: 공통 본문 처리 로직
  - `process_bodytext`: 본문을 파싱하여 `DocumentParts`로 분리
  - 머리말, 본문, 꼬리말, 각주, 미주 처리
  - 개요 번호 추적기 관리
- **`paragraph.rs`**: 공통 문단 처리 로직
  - `process_paragraph`: 문단 레코드를 처리
  - 컨트롤 헤더, 테이블, 이미지 등 처리
- **`table.rs`**: 공통 테이블 처리 로직 (예정)

### 뷰어별 모듈 구조

각 뷰어는 형식에 따라 다른 구조를 가질 수 있습니다:

- **Markdown 뷰어**: 표준 구조 (`document/`, `ctrl_header/` 서브디렉토리 사용)
- **HTML 뷰어**: 플랫 구조 (`document.rs`, `paragraph.rs` 등 개별 파일)
  - 테이블은 `ctrl_header/table/` 서브모듈로 분리 (render, process, cells, geometry, position, size, svg 등)

## 현재 구현된 뷰어

### 기존 뷰어 (HwpDocument 기반)

HwpDocument(hwp-core 내부 타입)를 직접 참조하여 렌더링합니다.

#### Markdown 뷰어 (`viewer/markdown/`)

- **상태**: 완료 (HWP 5.0 전용)
- **출력 형식**: Markdown 텍스트
- **특징**: 텍스트 기반 출력, 이미지 파일/base64, Markdown 테이블, 각주/미주 `[^1]:` 형식

#### HTML 뷰어 (`viewer/html/`)

- **상태**: 완료 (HWP 5.0 전용)
- **출력 형식**: 완전한 HTML 문서 (`<html>`, `<head>`, `<body>` 포함)
- **특징**: CSS 클래스(접두사 `ohah-hwpjs-`), CSS reset, 폰트/테두리/배경 매핑, base64/파일 이미지, `<table>` (colspan/rowspan), 각주/미주 `<div>` 컨테이너

### 새 뷰어 (Document 기반, HWP/HWPX 공통)

hwp-model의 공통 Document 모델을 사용하여 HWP/HWPX 양쪽에서 동일한 뷰어를 사용할 수 있습니다.

#### Document Markdown 뷰어 (`viewer/doc_markdown/`)

- **상태**: 진행 중 (26/46 HWP fixture 기존 뷰어와 동등)
- **출력 형식**: Markdown 텍스트
- **진입점**: `doc_to_markdown(doc: &Document, options: &DocMarkdownOptions) -> String`
- **구현된 기능**:
  - 문서 헤더 (`# HWP 문서` + 버전)
  - 페이지/섹션 구분선 (`---`)
  - 글자 모양 (bold, italic, strikethrough — underline 제외)
  - 머리글/꼬리글 (2-pass 수집)
  - 표 (빈 셀, 구분선, `<br>` 변환, bold 마커 제거)
  - 하이퍼링크 (Run 간 상태 추적 + HWP %hlk command)
  - 개요 번호/글머리표/번호 목록 트래커
  - 도형/그림 (ShapeComponent → Picture/Rectangle)
- **남은 작업**:
  - 표 빈 줄 정밀 조정
  - trailing `"  "` (문단 끝 2-space)
  - Numbering format_string (제1장, 제1절 등)
  - 각주/미주 참조 위치/포맷
  - 이미지 바이너리 출력 정밀화

#### Document HTML 뷰어 (`viewer/doc_html/`)

- **상태**: 기본 구현 완료 (HWPX 스냅샷 생성용)
- **출력 형식**: HTML 문서 블록
- **진입점**: `doc_to_html(doc: &Document, options: &DocHtmlOptions) -> String`
- **특징**: inline style, CSS 클래스 접두사, CharShape/ParaShape 기반 스타일링

#### 공통 유틸리티 (`viewer/doc_utils.rs`)

- `extract_hyperlink_url`: HWP %hlk command / HWPX parameters에서 URL 추출
- `image_format_to_mime`: ImageFormat → MIME type
- `find_binary_item`: BinaryStore에서 ID로 아이템 찾기
- `escape_css_font_name`: CSS font-family 이스케이핑

### 뷰어 교체 전략

기존 HwpDocument 기반 뷰어를 새 Document 기반 뷰어로 점진적으로 교체합니다:

1. **현재**: 기존 뷰어와 새 뷰어가 병렬 공존
2. **진행 중**: `doc_viewer_compare_test`로 출력 동등성 검증 (26/46 통과)
3. **목표**: 46/46 통과 후 기존 뷰어를 새 뷰어로 교체
4. **최종**: HWP/HWPX 양쪽 동일 뷰어 사용

## 향후 구현 예정 뷰어

- **Canvas 뷰어**: Canvas API 명령 또는 이미지 파일 출력 (예정)
- **PDF 뷰어**: PDF 문서 생성 (예정)

## 뷰어 확장 가이드

새로운 뷰어를 추가할 때는 다음 단계를 따릅니다:

1. **폴더 구조 생성**: `viewer/{format}/` 디렉토리 생성
2. **Renderer 구현**: `viewer/{format}/renderer.rs`에서 `Renderer` trait 구현
3. **옵션 정의**: `{Format}Options` 구조체 정의
4. **진입점 함수**: `to_{format}()` 함수 구현
5. **문서 변환 모듈**: `document/` 하위 모듈 구현
6. **컨트롤 헤더 변환**: `ctrl_header/` 하위 모듈 구현
7. **유틸리티 함수**: `utils.rs`, `common.rs` 구현
8. **테스트 추가**: 스냅샷 테스트 및 단위 테스트 작성

## 공통 로직 활용

모든 뷰어는 `viewer/core/`의 공통 로직을 활용합니다:

- **`process_bodytext`**: 본문 파싱 및 분리
- **`process_paragraph`**: 문단 처리
- **개요 번호 추적**: 각 뷰어별 `OutlineNumberTracker` 사용
- **하이브리드 접근**: 복잡한 렌더링은 기존 뷰어 함수를 직접 호출

이를 통해 코드 중복을 최소화하고 일관된 동작을 보장합니다.
