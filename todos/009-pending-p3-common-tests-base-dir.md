---
status: resolved
priority: p3
issue_id: "009"
tags: [code-review, quality]
dependencies: []
---

# P3: common.rs 경로 로직 통합 (tests_base_dir)

## Problem Statement

`find_fixtures_dir()`와 `find_font_dir()`가 각각 CARGO_MANIFEST_DIR + join("tests") 등을 반복. 경로 계산을 한 곳으로 모으면 유지보수에 유리.

## Findings

- **위치**: crates/hwp-core/tests/common.rs
- **내용**: 두 함수가 비슷한 manifest + tests 경로 계산을 중복.

## Proposed Solutions

1. **tests_base_dir() 도입**: manifest + "tests" 반환. find_fixtures_dir는 그 아래 "fixtures" 존재 시 Some, find_font_dir는 그 아래 "fixtures/fonts" + LiberationSans-Regular.ttf 존재 시 Some.  
   **Effort**: Small. **Risk**: Low.

2. **보류**: 현재 구조로도 동작에 문제 없음. 리팩터는 선택.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: crates/hwp-core/tests/common.rs

## Acceptance Criteria

- [x] 경로 계산이 한 함수(또는 한 곳)로 모임
- [x] 기존 find_fixtures_dir / find_font_dir 동작 유지, 테스트 통과

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | code-simplicity-reviewer |
| 2025-02-21 | tests_base_dir() 도입, find_fixtures_dir/find_font_dir에서 사용 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
