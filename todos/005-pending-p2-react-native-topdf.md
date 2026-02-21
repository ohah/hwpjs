---
status: resolved
priority: p2
issue_id: "005"
tags: [code-review, agent-native]
dependencies: []
---

# P2: React Native에 toPdf 노출

## Problem Statement

RN 앱에서 "이 HWP를 PDF로 저장"이 가능해야 하는데, Craby FFI에 toPdf가 없어 에이전트/자동화가 동일 플랫폼에서 동일 동작 불가.

## Findings

- **위치**: `packages/hwpjs/crates/lib/src/ffi.rs`, `hwpjs_impl.rs` — toJson, toMarkdown, file_header만 노출.
- **영향**: RN 사용자와 에이전트 간 PDF 내보내기 패리티 부재.

## Proposed Solutions

1. **Craby FFI에 toPdf 추가**: ToPdfOptions(font_dir, embed_images), `document.to_pdf(&pdf_options)` 호출 후 바이트 반환. RN 타입/네이티브에도 노출.  
   **Pros**: 플랫폼 일관성. **Cons**: FFI·네이티브 작업. **Effort**: Large. **Risk**: Low.

2. **보류**: RN PDF 수요가 적으면 이후 이슈로.  
   **Pros**: 당장 작업 감소. **Cons**: 기능 부재 유지. **Effort**: N/A. **Risk**: N/A.

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: packages/hwpjs/crates/lib (ffi, hwpjs_impl), React Native 바인딩
- **참고**: Node NAPI toPdf, ToPdfOptions 구조

## Acceptance Criteria

- [x] RN에서 HWP 바이트 → toPdf(options) → PDF 바이트(또는 파일 저장) 호출 가능
- [x] font_dir, embed_images 옵션 지원

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | agent-native-reviewer |
| 2025-02-21 | FFI ToPdfOptions/to_pdf, NativeReactNative.ts toPdf 스펙 추가 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
