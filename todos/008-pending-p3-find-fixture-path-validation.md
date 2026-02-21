---
status: resolved
priority: p3
issue_id: "008"
tags: [code-review, security]
dependencies: []
---

# P3: find_fixture_file 경로 검증

## Problem Statement

`find_fixture_file(filename)`에서 `filename`에 `"../other/file.hwp"`가 들어오면 `dir.join(filename)`으로 fixtures 밖을 가리킬 수 있음. 현재는 "noori.hwp", "table.hwp"만 사용해 실사용상 문제 없으나, 헬퍼 재사용 시 위험.

## Findings

- **위치**: `crates/hwp-core/tests/common.rs` (89–95행)
- **내용**: `file_path`가 `dir` 하위인지 검사하지 않음.

## Proposed Solutions

1. **하위 경로 검사**: `file_path.canonicalize()` 후 `dir` 하위인지 검사, 아니면 `None`.  
   **Effort**: Small. **Risk**: Low.

2. **filename 제한**: `filename`에 `..` 또는 절대경로가 포함되면 거부.  
   **Effort**: Small. **Risk**: Low.

3. **보류**: 현재 호출처가 고정 문자열이므로 P3로 둠.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: crates/hwp-core/tests/common.rs

## Acceptance Criteria

- [x] `find_fixture_file("../other.hwp")` 등이 None 또는 Err 반환
- [x] 기존 테스트( find_fixture_file("noori.hwp") 등) 동작 유지

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | security-sentinel |
| 2025-02-21 | filename ".." 거부, canonicalize로 fixtures 하위 검증 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
