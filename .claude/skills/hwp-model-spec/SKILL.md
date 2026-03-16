---
description: HWP 5.0과 HWPX(OWPML) 간 1:1 필드 매핑 테이블. hwp-model 크레이트 설계·구현·검증 시 참조.
---

# hwp-model-spec

HWP 5.0(바이너리)과 HWPX(KS X 6101:2024, XML) 두 포맷 간의 필드별 매핑 관계를 정리한 스펙 문서.

## 용도

- `hwp-model` 공통 문서 모델 설계 시 참조
- `hwp-parser` (HWP 5.0 → Document) 구현 시 변환 로직 확인
- `hwpx-parser` (HWPX → Document) 구현 시 변환 로직 확인
- `hwp-writer` / `hwpx-writer` 구현 시 역변환 로직 확인

## 파일 구성

| 파일 | 내용 |
|------|------|
| 1-매핑-개요.md | 전체 요약, 설계 원칙, 포맷별 특성 |
| 2-resources-매핑.md | 글꼴, 글자모양, 문단모양, 테두리/배경, 탭, 번호, 글머리표, 스타일 |
| 3-section-매핑.md | 섹션 정의, 페이지 설정, 각주/미주, Grid, 단 정의, 쪽 테두리 |
| 4-paragraph-매핑.md | 문단, Run, 텍스트, 제어문자, 글자모양 적용, 범위태그 |
| 5-control-매핑.md | 머리글/꼬리말, 각주/미주, 자동번호, 필드, 책갈피 |
| 6-shape-매핑.md | 개체 공통, 표, 그림, 도형 6종, OLE, 수식, 묶음, 글맵시 |
| 7-hints-전용필드.md | HWP only / HWPX only 필드 정리, hints 설계 |

## 사용 방법

- 특정 영역 구현 시 해당 번호의 `.md` 파일을 읽어 참조
- 예: 표 개체 구현 → `6-shape-매핑.md`, 문단 파싱 → `4-paragraph-매핑.md`
