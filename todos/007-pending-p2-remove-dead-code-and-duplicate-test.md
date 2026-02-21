---
status: resolved
priority: p2
issue_id: "007"
tags: [code-review, quality]
dependencies: []
---

# P2: Dead code 제거 및 중복 테스트 통합

## Problem Statement

- `minimal_pdf_bytes`는 호출처가 없어 dead code.
- `to_pdf_table_fixture_returns_valid_pdf`와 `pdf_generated_table_snapshot`이 동일 fixture·옵션으로 같은 검증을 수행해 중복.

## Findings

- **minimal_pdf_bytes**: `crates/hwp-core/src/viewer/pdf/mod.rs` (283–297행), `#[allow(dead_code)]`로만 유지.
- **중복 테스트**: `pdf_export.rs` — table.hwp로 PDF 생성 후 유효성 검사. 하나는 파일 쓰기+검사, 다른 하나는 검사만. (code-simplicity-reviewer)

## Proposed Solutions

1. **minimal_pdf_bytes 삭제**: 함수 전체 및 allow 제거. 필요 시 나중에 재추가.  
   **Effort**: Small. **Risk**: None.

2. **to_pdf_table_fixture_returns_valid_pdf 제거**: `pdf_generated_table_snapshot`만 두고, 여기서 유효성 검사 + 파일 쓰기 담당.  
   **Effort**: Small. **Risk**: None.

3. **주석 수정**: pdf_export.rs 161행 근처 "base64 스냅샷" → "유효성 검사 및 pdf_export__*.pdf 저장" 등 실제 동작에 맞게 수정.  
   **Effort**: Trivial. **Risk**: None.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: crates/hwp-core/src/viewer/pdf/mod.rs, crates/hwp-core/tests/pdf_export.rs

## Acceptance Criteria

- [x] minimal_pdf_bytes 제거 후 `cargo build` 및 `bun run test:rust` 통과
- [x] to_pdf_table_fixture_returns_valid_pdf 제거 후 pdf_generated_table_snapshot으로 동일 검증 유지
- [x] 관련 주석이 실제 동작과 일치

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | code-simplicity-reviewer |
| 2025-02-21 | minimal_pdf_bytes 삭제, 중복 테스트 제거, 주석 수정 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
