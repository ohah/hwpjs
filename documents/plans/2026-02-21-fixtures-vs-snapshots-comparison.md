# Fixtures HTML vs Snapshots HTML 비교 요약

**일시:** 2026-02-21  
**브랜치:** refactor/footnote-endnote-logic (main 리베이스 후)

## 비교 방법

- **기준(골든):** `crates/hwp-core/tests/fixtures/*.html`, `*.HTML`
- **결과물:** `crates/hwp-core/tests/snapshots/*.html` (동일 stem)
- **비교:** 동일 stem에 대해 파일 존재 시 `diff -q`로 동일 여부만 판단 (바이트 단위).

## 결과 요약

| 구분 | 개수 | 비고 |
|------|------|------|
| **DIFF** (내용 상이) | 33 | fixture와 snapshot 모두 존재하나 내용 다름 |
| **OK** (동일) | 0 | 현재 0건 |
| **NO_SNAPSHOT** (snapshot 없음) | 4 | sample-5017-pics, sample-5017, shapecontainer-2, shapepict-scaled |

## DIFF인 이유 (참고)

- **구조적 차이:** Fixture는 `<link rel="stylesheet" href="*_style.css">`, Snapshot은 `<style>...</style>` 인라인 (AGENTS.md 규칙).
- **클래스/스타일:** 접두사(`ohah-hwpjs-` 등), 수치 포맷·반올림, 레이아웃 계산 차이 가능.
- **동기화 목표:** `documents/plans/2026-02-21-fixtures-html-sync-plan.md` 참고.  
  Fixture를 골든으로 정규화 비교·테스트 도입 후, 구현을 fixture에 맞추는 작업은 별도 Phase로 진행 예정.

## 결론

- **현재:** 모든 비교 쌍에서 fixture와 snapshot은 **바이트 단위로는 동일하지 않음** (위 구조·규칙에 따른 차이).
- **다음 단계:** Fixture 매트릭스·정규화 비교 도입 후, “동일 stem에 .hwp+.html 있는 fixture”만 대상으로 단계적 동기화 진행.
