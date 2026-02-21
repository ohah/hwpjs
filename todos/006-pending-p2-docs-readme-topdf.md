---
status: resolved
priority: p2
issue_id: "006"
tags: [code-review, documentation, agent-native]
dependencies: []
---

# P2: README·CLI 가이드에 to-pdf / toPdf 추가

## Problem Statement

PDF 기능의 발견 가능성이 부족함. README의 CLI·Node 예시에 `to-pdf` / `toPdf`가 없어 에이전트·개발자가 문서만으로 사용법을 알기 어려움.

## Findings

- **위치**: `packages/hwpjs/README.md`, CLI 가이드
- **내용**: to-json, to-markdown 등은 있을 수 있으나 to-pdf·toPdf 예시 부재 (agent-native-reviewer).

## Proposed Solutions

1. **README에 to-pdf 예시 추가**: `hwpjs to-pdf input.hwp -o out.pdf [--font-dir ...] [--no-embed-images]`  
   **Effort**: Small. **Risk**: None.

2. **Node API 예시**: `toPdf(buffer, { fontDir, embedImages })` 사용 예 추가.  
   **Effort**: Small. **Risk**: None.

3. **CLI 도움말**: `hwpjs to-pdf --help` 출력이 이미 있다면, README에서 해당 명령을 언급만 해도 됨.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: packages/hwpjs/README.md, docs(가이드)
- **타입**: NAPI 생성 타입에 toPdf/ToPdfOptions 포함 여부 확인 후, 수동 정의 시 추가.

## Acceptance Criteria

- [x] README 또는 가이드에 to-pdf CLI 예시 포함
- [x] Node에서 toPdf 사용 예시 또는 API 문서 링크 포함
- [x] (선택) dist/index.d.ts 등에 toPdf·ToPdfOptions 노출 확인

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | agent-native-reviewer |
| 2025-02-21 | README에 to-pdf/배치 pdf, toPdf API·예시 추가 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
