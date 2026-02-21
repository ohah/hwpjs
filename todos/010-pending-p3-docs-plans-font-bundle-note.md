---
status: resolved
priority: p3
issue_id: "010"
tags: [code-review, documentation]
dependencies: []
---

# P3: docs/plans에 폰트 번들 사용 안내 한 줄 추가

## Problem Statement

PDF 뷰어 계획 문서에 "폰트 없으면 스킵"만 있고, 실제로 `tests/fixtures/fonts/` 번들을 쓰고 `find_font_dir()`로 자동 지정한다는 안내가 없어 이후 작업자가 찾기 어려울 수 있음.

## Findings

- **위치**: docs/plans/2025-02-21-pdf-viewer.md (Task 3 등)
- **관련**: learnings-researcher — PR은 계획과 정합, "폰트는 tests/fixtures/fonts/ 번들 사용 가능, find_font_dir()로 자동 지정" 한 줄 추가 권장.

## Proposed Solutions

1. **Task 3(또는 폰트 섹션)에 한 줄 추가**: "폰트는 tests/fixtures/fonts/에 번들되어 있으며, 테스트에서는 find_font_dir()로 자동 사용됨."  
   **Effort**: Trivial. **Risk**: None.

2. **보류**: 계획 문서는 참고용이라 선택.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: docs/plans/2025-02-21-pdf-viewer.md
- **Protected**: docs/plans/*.md는 삭제/제거 대상이 아님(리뷰 규칙).

## Acceptance Criteria

- [x] 계획 문서에 폰트 번들·find_font_dir 언급 추가 (한 줄 수준)

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | learnings-researcher |
| 2025-02-21 | docs/plans/2025-02-21-pdf-viewer.md에 테스트·폰트 안내 한 줄 추가 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
