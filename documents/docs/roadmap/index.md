# 프로젝트 로드맵

HWPJS 프로젝트의 개발 계획과 목표를 정리한 로드맵입니다.

## 현재 상태 (0.1.0-rc.7)

### HWP 5.0 파서 ✅
- HWP 5.0 스펙 문서 기반 파서 구현 완료
- 주요 데이터 레코드 및 스토리지 파싱 지원
- FileHeader, DocInfo, BodyText 파싱

### 마크다운 뷰어 ✅
- HWP 문서를 마크다운 형식으로 변환
- 텍스트, 테이블, 이미지, 하이퍼링크, 개요/번호매기기 지원
- base64 이미지 임베딩 및 별도 파일 저장 옵션
- CharShape 기반 굵기/기울임/밑줄/취소선 렌더링

### HTML 뷰어 ✅
- HWP 문서를 완전한 HTML 문서로 변환
- CSS 클래스 기반 스타일링 (CharShape, ParaShape)
- 테이블 렌더링 (SVG 테두리/배경, 셀 병합)
- 이미지 임베딩 (base64 또는 별도 파일)
- 머리글/바닥글, 각주/미주, 다단 레이아웃
- 하이퍼링크 onclick 렌더링
- 페이지 설정(PageDef) 기반 레이아웃

### CLI ✅
- `to-json`: HWP → JSON 변환
- `to-markdown`: HWP → Markdown 변환
- `to-html`: HWP → HTML 변환
- `info`: 파일 정보 조회
- `extract-images`: 이미지 추출
- `batch`: 디렉토리 일괄 변환 (json, markdown, html)

### 멀티 플랫폼 ✅
- Node.js: NAPI-RS 네이티브 모듈
- Web: WASM 빌드
- React Native: Craby 바인딩 (iOS/Android)

## 단기 계획

### HTML 뷰어 고도화
- LineSegmentInfo 기반 절대좌표 렌더링 정밀도 개선
- ShapeComponent group_offset 렌더링 지원
- 복잡한 다단 레이아웃 개선

### 이미지 관련 기능 강화
- `extract_images` NAPI 함수 공개 (현재 CLI만 지원)
- 이미지 렌더링 크기 정보(width, height) 반환 추가

### 수식 및 차트 지원
- HWP 문서 내 수식(Equation) 파싱 및 렌더링
- 차트(Chart) 데이터 추출 및 시각화

### E2E 테스트 확대
- Node.js/Web/React Native 플랫폼별 E2E 테스트 강화
- Playwright 기반 시각적 스냅샷 테스트 확대

## 장기 계획

### PDF 뷰어
- 코어 레벨에서 printpdf 기반 PDF 변환 구현 완료 (보류 중)
- NAPI/CLI 노출 및 안정화 후 공개 예정
- 한글 폰트 지원 (NotoSansKR 등)

### HWPX 형식 지원
- HWPX (한글 XML 형식) 파싱 지원
- HWP와 HWPX 간 변환

### 패키지 최적화
- npm 패키지 크기 최적화 (현재 ~132MB → 목표 100MB 이하)
- React Native 정적 라이브러리 선택적 다운로드

## 버전별 목표

### 0.1.0 (현재 RC 단계)
- HWP 5.0 파일 파싱
- JSON, Markdown, HTML 변환
- Node.js, Web, React Native 환경 지원
- CLI 도구

### 1.0.0
- API 안정화 및 정식 릴리스
- 수식/차트 지원
- E2E 테스트 완비

### 2.0.0 (미정)
- PDF 출력 공개
- HWPX 형식 지원
