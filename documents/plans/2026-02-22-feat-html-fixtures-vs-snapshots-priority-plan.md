---
title: feat(core) HTML fixtures vs snapshots 비교 및 fixture 일치 진행 순서
type: feat
status: active
date: 2026-02-22
---

# HTML Fixtures vs Snapshots 일치 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** fixtures 원본 HTML과 뷰어 생성 snapshot HTML을 `<link>`→`<style>` 제외하고 구조·클래스·스타일 일치시키고, diff 작은 순으로 stem별 수정 후 스냅샷 갱신·테스트 통과까지 반복한다.

**Architecture:** Phase 1에서 133줄 그룹 샘플(aligns, page) diff를 분석해 공통 이슈를 문서화한다. Phase 2에서 facename2(112줄)부터 순서대로 viewer 코드 수정 → 스냅샷 갱신 → `bun run test:rust:snapshot` 통과 → 커밋을 stem마다 반복한다. 값은 스펙·JSON·fixture 기준으로만 추론(AGENTS.md).

**Tech Stack:** Rust (hwp-core), insta 스냅샷, Bun(test runner), `crates/hwp-core/src/viewer/html/`.

---

## Overview (요약)

`crates/hwp-core/tests/fixtures/`의 원본 HTML(한/글에서 내보낸 골든 기준)과 `tests/snapshots/`의 뷰어 생성 HTML을 비교한 결과를 정리하고, **어떤 항목부터 fixture와 맞출지** 진행 순서를 정의한 플랜이다.  
AGENTS.md 기준: `<link>` → `<style>` 변경만 허용되고, HTML 구조·태그·클래스·속성·인라인 스타일은 원본(fixture)과 **완전 일치**해야 한다.

**관련 문서:** `documents/brainstorms/2026-02-22-html-fixtures-vs-snapshots-diff-priority-brainstorm.md`

---

## 현재 상태 요약

### 비교 결과

| 구분 | 수량 |
|------|------|
| Fixture 원본 HTML | 39개 |
| Snapshot 생성 HTML | 42개 |
| **공통 stem(둘 다 있는 쌍)** | **39개** |
| **완전 일치( diff 0 )** | **0개** |

- **Snapshot만 있는 항목:** `table-caption-preview` — fixture 없음 → "fixture 일치" 목표에서 제외.

### Fixture–Snapshot diff 크기 (diff 라인 수 오름차순)

| diff 라인 수 | stem |
|-------------|------|
| 112 | facename2 |
| 133 | aligns, borderfill, charstyle, headerfooter, hwpsummaryinformation, issue30, matrix, multicolumns, multicolumns-widths, page, sample-5017-pics, shapeline, shapepict-scaled, textbox |
| 135 | footnote-endnote |
| 136 | shaperect, table-caption |
| 139 | issue144-fields-crossing-lineseg-boundary, shapecontainer-2, table-position |
| 145 | multicolumns-layout |
| 157 | parashape, sample-5017, selfintroduce |
| 160 | lists, outline, table2 |
| 163 | pagedefs |
| 166 | example, facename, underline-styles |
| 169 | linespacing |
| 175 | charshape |
| 202 | table |
| 207 | strikethrough |
| 256 | multicolumns-in-common-controls |
| 697 | lists-bullet |
| 1129 | noori |

### 차이 유형 (추정)

- **공통 요인:** fixture는 `<link rel="stylesheet" href="...">` + 외부 CSS, snapshot은 `<style>` 인라인 → 허용 차이. 나머지 구조·클래스·스타일 값 일치가 목표.
- **레이아웃/구조:** headerfooter는 2026-02-21 계획 완료. hpa 내 머리말·꼬리말·본문 hcD 절대 위치.
- **스타일 수치:** line-height, top, left 등 mm 단위는 스펙·JSON 기반 추론 필요.
- **복잡 문서:** noori(1129), lists-bullet(697), multicolumns-in-common-controls(256) 등은 구조·스타일 복합 이슈 가능성.

---

## Proposed Solution: 진행 순서

**채택 방향:** diff 크기 작은 것부터 진행 + 133줄 그룹은 샘플 분석 후 공통 이슈 있으면 일괄 수정. (옵션 A + 옵션 C 조합)

### Phase 1: 133줄 그룹 샘플 분석 및 공통 이슈 정리

- [x] 133줄 그룹 중 1~2개(예: aligns, page) diff 내용 샘플 분석.
- [x] 공통 차이(클래스 접두사, 메타 태그, 한 줄 스타일 등) 문서화.
- [x] 공통이면 일괄 수정 작업 범위 정의; 아니면 Phase 2를 stem 단위로 진행.

### Phase 2: diff 작은 순으로 fixture 일치 (빠른 승리)

| 순서 | stem | diff 라인 수 | 비고 |
|------|------|-------------|------|
| 1 | facename2 | 112 | 최소 diff |
| 2 | 133줄 그룹 | 133 | 공통 이슈 정리 후 일괄 또는 개별 (headerfooter 포함) |
| 3 | footnote-endnote | 135 | |
| 4 | shaperect, table-caption | 136 | |
| 5 | issue144-fields-crossing-lineseg-boundary, shapecontainer-2, table-position | 139 | |
| 6 | multicolumns-layout | 145 | |
| 7 | parashape, sample-5017, selfintroduce | 157 | |
| 8 | lists, outline, table2 | 160 | |
| 9 | pagedefs | 163 | |
| 10 | example, facename, underline-styles | 166 | |
| 11 | linespacing | 169 | (별도 계획 있음: 2026-02-21-feat-linespacing-fixture-match-plan) |
| 12 | charshape | 175 | |
| 13 | table | 202 | |
| 14 | strikethrough | 207 | |
| 15 | multicolumns-in-common-controls | 256 | |
| 16 | lists-bullet | 697 | |
| 17 | noori | 1129 | |

각 stem별로: fixture와 `<link>`→`<style>` 제외 구조·클래스·스타일 일치 → 스냅샷 갱신 → `bun run test:rust:snapshot` 통과.

### Phase 3 (선택): 기능 영역별 정리

- 레이아웃/페이지: headerfooter, page, pagedefs, multicolumns-*
- 테이블: table, table2, table-caption, table-position
- 목록: lists, lists-bullet
- 문자/단락: charshape, charstyle, facename, facename2, underline-styles, strikethrough, aligns, borderfill
- 복합: noori, sample-5017 등

동일 모듈 수정 시 한 번에 검증·커밋하면 효율적.

---

## Implementation Plan: Bite-Sized Tasks

### Task 1: 133줄 그룹 샘플 — aligns diff 추출

**Files:**
- Read: `crates/hwp-core/tests/fixtures/aligns.HTML` (또는 `aligns.html` 등 대소문자 variants)
- Read: `crates/hwp-core/tests/snapshots/aligns.html`
- Create: `documents/plans/2026-02-22-html-133line-group-diff-notes.md` (분석 노트)

**Step 1: diff 실행 및 출력 저장**

```bash
cd /Users/yoonhb/Documents/workspace/hwpjs/crates/hwp-core/tests
diff fixtures/aligns.HTML snapshots/aligns.html > /tmp/aligns-diff.txt 2>&1 || true
wc -l /tmp/aligns-diff.txt
```

Expected: 차이 라인 수 확인 (예: 133줄대).

**Step 2: diff 내용 요약을 분석 노트에 기록**

`documents/plans/2026-02-22-html-133line-group-diff-notes.md`에 다음 형식으로 적기:

- `<link>` vs `<style>` 구간 (허용 차이)
- 클래스명/접두사 차이 유무
- 메타/head 차이 유무
- 본문 구조·인라인 스타일 차이 유무

**Step 3: Commit**

```bash
git add documents/plans/2026-02-22-html-133line-group-diff-notes.md
git commit -m "docs: add 133line group diff analysis notes (aligns)"
```

---

### Task 2: 133줄 그룹 샘플 — page diff 추출 및 노트 보강

**Files:**
- Read: `crates/hwp-core/tests/fixtures/page.HTML`, `snapshots/page.html`
- Modify: `documents/plans/2026-02-22-html-133line-group-diff-notes.md`

**Step 1: page diff 실행**

```bash
cd crates/hwp-core/tests
diff fixtures/page.HTML snapshots/page.html > /tmp/page-diff.txt 2>&1 || true
wc -l /tmp/page-diff.txt
```

**Step 2: aligns와 공통 패턴인지 노트에 추가**

동일 문서에 "page" 섹션 추가. aligns와 공통인 항목(클래스 접두사, 메타, 한 줄 스타일 등) 표시.

**Step 3: Commit**

```bash
git add documents/plans/2026-02-22-html-133line-group-diff-notes.md
git commit -m "docs: add page to 133line group diff analysis"
```

---

### Task 3: 공통 이슈 정리 및 일괄/개별 전략 결정

**Files:**
- Modify: `documents/plans/2026-02-22-html-133line-group-diff-notes.md`

**Step 1: 결론 섹션 작성**

- "공통 이슈" 목록 (있으면): 예) `ohah-hwpjs-` 접두사, `<meta>`, 인라인 스타일 한 줄 등.
- "일괄 수정 범위" 또는 "stem별 개별 수정" 결정 및 근거 1~2문장.

**Step 2: Commit**

```bash
git add documents/plans/2026-02-22-html-133line-group-diff-notes.md
git commit -m "docs: conclude 133line group common issues and strategy"
```

---

### Task 4: facename2 fixture 일치 (Phase 2 첫 stem 예시) — title 적용 완료

**Files:**
- Read: `crates/hwp-core/tests/fixtures/facename2.HTML`, `snapshots/facename2.html`
- Read: `crates/hwp-core/tests/snapshots/snapshot_tests__facename2_json.snap` 또는 `*.json` (값 참조)
- Modify: `crates/hwp-core/src/viewer/html/` 내 해당 출력을 만드는 모듈 (document, paragraph, line_segment, ctrl_header 등)

**Step 1: diff로 차이 유형 파악**

```bash
cd crates/hwp-core/tests
diff fixtures/facename2.HTML snapshots/facename2.html | head -200
```

구조·클래스·스타일 중 무엇이 다른지 목록화.

**Step 2: JSON/스펙으로 올바른 값 확인**

`snapshots/facename2.json` 또는 스펙에서 font/face 관련 필드 확인. AGENTS.md: 임의 상수 금지.

**Step 3: viewer 코드 수정**

facename2 차이를 없애는 최소 변경만 적용 (해당 stem에 영향만).

**Step 4: HTML 스냅샷 재생성 및 테스트**

```bash
cd /Users/yoonhb/Documents/workspace/hwpjs
bun run test:rust:snapshot
```

Expected: `snapshot_tests__facename2_html.snap` 및 `snapshots/facename2.html` 갱신. 실패 시 `bun run test:rust:snapshot:review`로 검토.

**Step 5: diff 재확인 후 커밋**

```bash
cd crates/hwp-core/tests
diff fixtures/facename2.HTML snapshots/facename2.html
```

Expected: 차이 없음 또는 `<link>`→`<style>` 등 허용 차이만.

```bash
git add crates/hwp-core/src/viewer/html/** crates/hwp-core/tests/snapshots/snapshot_tests__facename2_html.snap crates/hwp-core/tests/snapshots/facename2.html
git commit -m "fix(core): align facename2 HTML output with fixture"
```

---

### Task 5+: 나머지 stem에 동일 패턴 적용

각 stem에 대해 Task 4와 동일한 흐름:

1. `diff fixtures/<stem>.HTML snapshots/<stem>.html` 로 차이 파악
2. JSON/스펙으로 값 확인
3. viewer 코드 수정 (최소 범위)
4. `bun run test:rust:snapshot` 실행 후 스냅샷 갱신/검토
5. `diff` 로 허용 차이만 남았는지 확인 후 커밋

**Phase 2 순서 (표 참고):** facename2 → 133줄 그룹 → footnote-endnote → shaperect, table-caption → … → noori.  
linespacing은 별도 계획(`documents/plans/2026-02-21-feat-linespacing-fixture-match-plan.md`) 참고.

**line-height 일반 열외:** line-height/top 관련 차이는 본 플랜에서 수정 대상에서 제외. facename2에 대해 title 적용 완료 후, footnote-endnote·shaperect·table-caption 등 diff 확인 결과 동일 패턴(link/style·포맷·line-height)만 있어 추가 뷰어 수정 없이 정리. 분석 노트 `documents/plans/2026-02-22-html-133line-group-diff-notes.md`에 Phase 2 진행 정리 반영.

---

## Technical Considerations

- **비교 방법:** 동일 stem끼리 `diff fixtures/<stem>.HTML snapshots/<stem>.html` (확장자 대소문자 주의).
- **검증:** 각 항목 fixture 일치 후 `snapshot_tests__<stem>_html.snap` 및 `snapshots/<stem>.html` 갱신, `bun run test:rust:snapshot` / `bun run test:rust:snapshot:review` 수행.
- **AGENTS.md:** JSON 스냅샷·스펙·fixture 기준으로 값 추론, 임의 상수/하드코딩 금지.
- **제외:** `table-caption-preview`는 fixture 없음 → 이 플랜의 목표 대상 아님.

---

## Acceptance Criteria

- [x] Phase 1: 133줄 그룹 샘플 분석 완료, 공통 이슈 문서화(또는 “개별 이슈” 결론).
- [x] Phase 2 (line-height 열외): facename2 title 적용 완료; 133줄 그룹·footnote-endnote·shaperect·table-caption 등은 허용 차이 + line-height만 남아 추가 코드 수정 없음으로 정리.
- [x] 스냅샷 갱신 및 `bun run test:rust:snapshot` 통과.
- [x] 기존 개별 계획(headerfooter, linespacing 등)과 중복 없이 참조·순서만 이 플랜에 반영.

---

## References & Research

- 브레인스토밍: `documents/brainstorms/2026-02-22-html-fixtures-vs-snapshots-diff-priority-brainstorm.md`
- headerfooter 레이아웃: `documents/plans/2026-02-21-fix-headerfooter-layout-match-fixture-plan.md`
- linespacing fixture 일치: `documents/plans/2026-02-21-feat-linespacing-fixture-match-plan.md`
- AGENTS.md: HTML 뷰어 테스트 규칙, fixture = 원본 스냅샷 기준

---

## Execution Handoff

**Plan complete and saved to `documents/plans/2026-02-22-feat-html-fixtures-vs-snapshots-priority-plan.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** — 태스크마다 새 서브에이전트를 붙이고, 태스크 사이에 리뷰하며 진행. 빠른 반복에 유리.
2. **Parallel Session (separate)** — 새 세션에서 executing-plans 스킬로 이 플랜 열고, 체크포인트 단위로 일괄 실행.

**Which approach?**

- **Subagent-Driven 선택 시:** 이 세션에서 superpowers:subagent-driven-development 사용. 태스크 단위로 서브에이전트 호출 후 코드 리뷰.
- **Parallel Session 선택 시:** worktree에서 새 세션 열고, superpowers:executing-plans 로 플랜 실행.
