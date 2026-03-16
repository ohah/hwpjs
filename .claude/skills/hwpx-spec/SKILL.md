---
name: hwpx-spec
description: KS X 6101:2024 HWPX(OWPML) 문서 구조 표준 명세. HWPX 파싱·렌더링·검증 시 해당 섹션의 .md 파일을 읽어 참조.
---

# KS X 6101:2024 - HWPX (OWPML) 문서 구조 표준

KS X 6101:2024 "개방형 워드프로세서 마크업 언어(OWPML) 문서 구조" 표준을 섹션별로 정리한 스펙 문서이다.

## 사용 방법

- HWPX 구현·파싱·렌더링·버그 수정 시 **해당 섹션의 .md 파일**을 열어 참조한다.
- 예: Header XML 파싱 → `08-header-xml.md`, 본문 구조 → `09-body-xml-1.md`, 표/그림 객체 → `10-body-xml-2.md`, XSD 스키마 확인 → `E-paralist-schema.md`.

## 파일 목록

### 본문

| 섹션 | 파일명 | 내용 |
|------|--------|------|
| 머리말, 개요, §1 | 00-overview.md | 표준 개요, 적용범위 |
| §2 | 01-references.md | 인용표준 (11건) |
| §3 | 02-terms.md | 용어와 정의 (69개) |
| §4 | 03-conformance.md | 적합성 (SP 레벨) |
| §5 | 04-relations.md | 다른 기술표준과의 관계 (XML, 유니코드, MIME 등) |
| §6 | 05-schema-composition.md | OWPML 스키마 구성 (5개 스키마) |
| §7 | 06-basic-formats.md | 기본 형식 및 단위 (HWPUNIT, 나열 형식, 색상) |
| §8 | 07-container-packaging.md | 컨테이너 및 패키징 (OCF, OPF) |
| §9 | 08-header-xml.md | Header XML 스키마 (폰트, 테두리, 글자속성, 문단속성, 스타일 등) |
| §10.1-10.8 | 09-body-xml-1.md | 본문 XML - 구조 요소 (sec, p, run, secPr, ctrl, t) |
| §10.9-10.12 | 10-body-xml-2.md | 본문 XML - 객체 (도형, 표, 그림, 수식, OLE, 양식 등) |
| §11 | 11-masterpage-xml.md | 바탕쪽 설정 XML 스키마 |
| §12 | 12-history-xml.md | 문서 이력 정보 XML 스키마 |
| §13 | 13-version-xml.md | 파일 형식 버전 정보 XML 스키마 |
| §14 | 14-settings-xml.md | Settings XML 스키마 |
| §15 | 15-encryption.md | 암호화 (AES, PBKDF2) |
| §16 | 16-signature.md | 전자서명 (XML Signature) |
| §17 | 17-backward-compat.md | 하위 호환성 요소 (switch) |

### 부속서

| 부속서 | 파일명 | 내용 |
|--------|--------|------|
| A (참고) | A-purpose.md | 제정의 취지 |
| B (규정) | B-version-schema.md | Version XML 스키마 (XSD) |
| C (규정) | C-header-schema.md | Header XML 스키마 (XSD) |
| D (규정) | D-body-schema.md | Body XML 스키마 (XSD) |
| E (규정) | E-paralist-schema.md | ParaList XML 스키마 (XSD) |
| F (규정) | F-core-schema.md | Core XML 스키마 (XSD) |
| G (규정) | G-masterpage-schema.md | MasterPage XML 스키마 (XSD) |
| H (규정) | H-history-schema.md | Document History XML 스키마 (XSD) |
| I (규정) | I-formula-script.md | 수식 스크립트 (문법, 예약어, 명령어) |
