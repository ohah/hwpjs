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

### Markdown 뷰어 (`viewer/markdown/`)

- **상태**: 완료
- **출력 형식**: Markdown 텍스트
- **특징**: 텍스트 기반 출력, 이미지 파일/base64, Markdown 테이블, 각주/미주 `[^1]:` 형식

### HTML 뷰어 (`viewer/html/`)

- **상태**: 완료
- **출력 형식**: 완전한 HTML 문서 (`<html>`, `<head>`, `<body>` 포함)
- **특징**: CSS 클래스(접두사 `ohah-hwpjs-`), CSS reset, 폰트/테두리/배경 매핑, base64/파일 이미지, `<table>` (colspan/rowspan), 각주/미주 `<div>` 컨테이너

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
