# 현재 작업

현재 진행 중이거나 곧 시작할 작업 항목들입니다.

## 완료된 작업

### toJson ✅
- HWP 파일을 JSON 형식으로 변환
- NAPI/CLI/WASM 모두 지원
- 0.1.0-rc.1부터 지원

### toMarkdown ✅
- HWP 파일을 Markdown 형식으로 변환
- base64/blob 이미지 옵션, HTML 태그 옵션
- 하이퍼링크, 개요, 번호매기기 지원
- 0.1.0-rc.1부터 지원

### toHtml ✅
- HWP 파일을 HTML 형식으로 변환
- CSS 클래스 기반 스타일링, CharShape/ParaShape 적용
- 테이블(SVG 테두리), 이미지, 머리글/바닥글, 각주/미주
- 0.1.0-rc.5부터 지원

### fileHeader ✅
- HWP 파일의 FileHeader만 빠르게 추출
- 0.1.0-rc.1부터 지원

### CLI ✅
- to-json, to-markdown, to-html, info, extract-images, batch 명령어
- 0.1.0-rc.1부터 지원 (to-html, extract-images는 이후 추가)

### React Native 지원 ✅
- Craby 기반 iOS/Android 네이티브 바인딩
- ArrayBuffer 지원 (코드젠 버그 커스텀 수정 포함)
- 0.1.0-rc.1부터 지원

## 지원 예정 함수

### 이미지 추출 NAPI 함수

- **함수명**: `extract_images`
- **현재 상태**: CLI에서는 `extract-images` 명령어로 지원 중이나, NAPI 함수로는 미공개
- **목표**: Node.js/Web에서 프로그래밍 방식으로 이미지 추출 가능하게 함
- **우선순위**: 중간
- **상태**: 계획됨

## 개선 작업

### 배포 패키지 용량 최적화

- **현재 상태**: npm 패키지 크기 **131.67 MB** (이전 205.10 MB에서 약 36% 감소)
  - 주요 원인: React Native용 `.a` 정적 라이브러리 파일 (Android 4 아키텍처, iOS 2 아키텍처)
- **목표**: 100MB 이하
- **완료된 최적화**:
  1. Rust 빌드 최적화 ✅ (lto, strip, codegen-units=1, opt-level="z", panic="abort")
  2. 빌드 산출물 제외 강화 ✅
  3. Android CMake 빌드 최적화 ✅
- **추가 최적화 가능 방법**:
  - 선택적 아키텍처 제외 (Android x86/x86_64)
  - 의존성 `default-features = false` 적용
  - 링커 플래그 (`--gc-sections`, `--as-needed`)
- **우선순위**: 높음
- **상태**: 진행 중

### 이미지 렌더링 크기 정보 추가

- **현재 상태**: 이미지 데이터만 반환, 렌더링 크기 정보 미포함
- **목표**: `ImageData`에 `width`, `height` 필드 추가
- **우선순위**: 중간
- **상태**: 계획됨

### Craby 객체 배열(Object[]) 지원

- **현재 상태**: Craby가 `ImageData[]` 같은 객체 배열 타입을 인식하지 못함
- **임시 해결**: React Native `ToMarkdownResult`에서 `images` 필드 제거
- **우선순위**: 중간
- **상태**: 계획됨 (Craby 라이브러리 수정 필요)

## 보류된 작업

### PDF 뷰어 공개

- **현재 상태**: 코어 레벨에서 printpdf 기반 PDF 변환 완전 구현됨
- **보류 이유**: 한글 폰트 지원, 레이아웃 정밀도 등 추가 검증 필요
- **구현 범위**: document, font, page, styles, table, text, pdf_image 모듈
- **CLI/NAPI**: 코드는 존재하나 비활성화 상태
- **테스트**: 스냅샷 테스트 작성됨 (블록 주석 처리)
- **우선순위**: 중간
- **상태**: 보류됨

### ShapeComponent의 group_offset 렌더링 지원

- **보류 이유**: ShapeComponent 테스트 부족
- **우선순위**: 중간
- **상태**: 보류됨

## 알 수 없는 요소 (미지원 기능)

### 알 수 없는 Ctrl ID
- `CtrlHeaderData::Other` — 표 127, 128의 알 수 없는 컨트롤 ID들
- **상태**: 조사 필요

### 알 수 없는 Shape Component
- `ShapeComponentUnknown` — 알 수 없는 개체 타입
- **상태**: 조사 필요

### 알 수 없는 필드 타입
- `FIELD_UNKNOWN` ("%unk") — 알 수 없는 필드 타입
- **상태**: 조사 필요

## 명세서 문서화 작업 예정

- **차트 형식 명세서** (`documents/docs/spec/chart.md`): 작업 예정
- **배포용 문서 형식 명세서** (`documents/docs/spec/distribution.md`): 작업 예정
- **HWP 3.0 / HWPML 형식 명세서** (`documents/docs/spec/hwp-3.0-hwpml.md`): 작업 예정

## 알려진 버그

### ParaLineSeg 스타일 적용 제한사항
- HTML `span` 태그(inline 요소)에 width/height/padding이 적용되지 않는 문제
- **상태**: 알려진 제한사항

### 취소선 속성 파싱
- 일부 HWP 파일에서 `strikethrough` bits 18-20이 0으로 파싱되는 문제
- **상태**: 뷰어 폴백 적용 완료 (underline_type=2 → 취소선 렌더링)

## 버전 관리

- **0.1.0-rc.1**: 초기 배포 (toJson, toMarkdown, fileHeader, CLI)
- **0.1.0-rc.5**: HTML 뷰어 추가
- **0.1.0-rc.7**: 하이퍼링크/개요/번호매기기 마크다운 렌더링, CharShape 음영 색 지원
