---
status: resolved
priority: p2
issue_id: "003"
tags: [code-review, security]
dependencies: []
---

# P2: font_dir 경로 정책

## Problem Statement

CLI/API에서 `font_dir`을 사용자가 제어할 수 있어, 임의 경로(예: `/etc`, 심볼릭 링크)를 넘기면 해당 경로에서 폰트 읽기 시도 → 정보 유출·리소스 사용 우려.

## Findings

- **위치**: `packages/hwpjs/src-cli/commands/to-pdf.ts` (options.fontDir), `src/lib.rs`, `crates/hwp-core/src/viewer/pdf/mod.rs` (fonts::from_files(dir, ...))
- **내용**: 경로 검증 없이 그대로 사용.

## Proposed Solutions

1. **화이트리스트/고정 경로**: 허용 디렉터리만 지정(예: 설정 파일·환경변수).  
   **Effort**: Medium. **Risk**: Low.

2. **문서화**: "font_dir은 신뢰할 수 있는 경로만 지정하라"고 README/CLI 도움말에 명시.  
   **Effort**: Small. **Risk**: 사용자 실수 가능.

3. **경로 검사**: 지정된 기준 디렉터리(예: cwd) 하위인지 검사 후만 사용.  
   **Effort**: Small. **Risk**: Low.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: CLI to-pdf.ts, packages/hwpjs/src/lib.rs, crates/hwp-core/src/viewer/pdf/mod.rs

## Acceptance Criteria

- [x] font_dir에 대한 정책이 문서 또는 코드로 명확함
- [x] (선택) 경로 제한 구현 시 기존 테스트·로컬 폰트 사용에 지장 없음

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | security-sentinel |
| 2025-02-21 | PdfOptions/ToPdfOptions doc에 신뢰 경로만 사용 안내 추가 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
