---
status: resolved
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

# P1: CLI to-pdf 출력 경로 path traversal

## Problem Statement

`hwpjs to-pdf input.hwp -o <path>`에서 `--output`이 사용자 입력이므로 `../../../etc/passwd` 등 상대 경로로 **임의 파일 덮어쓰기**가 가능함. `resolve(options.output)`만으로는 기준 디렉터리 이탈을 막지 못함.

## Findings

- **위치**: `packages/hwpjs/src-cli/commands/to-pdf.ts` (35–36행)
- **코드**: `const outputPath = resolve(options.output); writeFileSync(outputPath, pdf);`
- **영향**: 현재 디렉터리 기준 임의 경로에 PDF 쓰기 → 보안 취약점.

## Proposed Solutions

1. **기준 디렉터리 하위만 허용**  
   cwd(또는 `--output-dir`)를 기준으로 `path.relative()`로 이탈 여부 검사, `..` 포함 시 거부.  
   **Pros**: 명확한 정책. **Cons**: 구현 필요. **Effort**: Small. **Risk**: Low.

2. **`--output-dir`만 받고 파일명 고정**  
   예: `-o out.pdf` 대신 `--output-dir ./pdfs`만 허용, 입력 파일명 기반으로 `./pdfs/<basename>.pdf` 생성.  
   **Pros**: 경로 제어 단순. **Cons**: 사용자 기대와 다를 수 있음. **Effort**: Medium. **Risk**: Low.

3. **문서만 명시**  
   "`-o`는 현재 디렉터리 하위만 권장" 등.  
   **Pros**: 없음. **Cons**: 취약점 유지. **Effort**: N/A. **Risk**: High.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: `packages/hwpjs/src-cli/commands/to-pdf.ts`
- **수정**: 출력 경로가 cwd(또는 지정 output-dir) 하위인지 검증 후 쓰기.

## Acceptance Criteria

- [x] `-o ../../../other/file.pdf` 같은 경로에 쓰기 시도 시 거부(에러 메시지)
- [x] cwd 하위 또는 명시된 output-dir 하위만 허용
- [x] 기존 정상 사용(cwd 하위 `-o out.pdf`) 동작 유지

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | security-sentinel |
| 2025-02-21 | isOutputUnderCwd 추가, cwd 하위만 허용 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
- Severity: 🔴 CRITICAL (P1) — blocks merge
