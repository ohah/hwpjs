---
status: resolved
priority: p2
issue_id: "004"
tags: [code-review, agent-native]
dependencies: []
---

# P2: batch CLI에 --format pdf 추가

## Problem Statement

사용자가 "이 폴더의 HWP 전부 PDF로"를 기대할 때, 현재 `batch`에는 `--format pdf`가 없어 에이전트/사용자가 여러 번 `to-pdf`를 반복 호출해야 함.

## Findings

- **위치**: `packages/hwpjs/src-cli/commands/batch.ts` — format 분기에서 json | markdown | html 만 처리.
- **영향**: 배치 PDF 변환 시 에이전트가 사용자와 동일한 단일 명령으로 수행 불가.

## Proposed Solutions

1. **batch에 `--format pdf` 추가**: `toPdf` 호출 후 각 파일을 `.pdf`로 저장, `--font-dir`(및 필요 시 `--no-embed-images`) 지원.  
   **Pros**: 사용자·에이전트 동일 워크플로. **Cons**: 구현 필요. **Effort**: Medium. **Risk**: Low.

2. **문서만**: "배치 PDF는 to-pdf를 루프로 호출하라"고 안내.  
   **Pros**: 없음. **Cons**: 기능 부재 유지. **Effort**: N/A. **Risk**: N/A.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: `packages/hwpjs/src-cli/commands/batch.ts`
- **참고**: to-pdf.ts, NAPI toPdf 옵션과 일치시키기.

## Acceptance Criteria

- [x] `hwpjs batch --format pdf --output-dir ./out <inputs>` (또는 동등)로 여러 HWP → PDF 변환 가능
- [x] `--font-dir`, `--no-embed-images` 등 to-pdf 옵션과 정렬

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | agent-native-reviewer |
| 2025-02-21 | batch에 --format pdf, --font-dir, --no-embed-images 추가 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
