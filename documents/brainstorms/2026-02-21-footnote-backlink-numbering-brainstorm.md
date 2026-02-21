---
date: 2026-02-21
topic: footnote-backlink-numbering
---

# 각주/미주 backlink 번호 수정

## What We're Building

각주/미주 수집 함수 `collect_footnote_content`에서 **고유 ID와 backlink([^n])**를 각 주석 번호에 맞게 생성하도록 수정한다.

## Why This Approach

- **원인**: `collect_footnote_content`가 `unique_id`와 `back_link`를 하드코딩(`"[footnote-id]"`, `"[^1]"`)해서 두 번째 각주도 `[^1]`로 출력됨.
- **흐름**: `process_bodytext`에서 각주/미주 컨트롤마다 `footnote_counter`/`endnote_counter`로 1, 2, 3…을 부여하고 `process_footnote(footnote_id, …)` / `process_endnote(endnote_id, …)`를 호출함. 이 번호는 본문 참조용으로만 쓰이고, **각주 내용 블록**을 만드는 `collect_footnote_content`에는 전달되지 않음.
- **접근**: `collect_footnote_content`에 **주석 번호(`note_id`)와 ID 접두어(`id_prefix`)**를 인자로 넘겨, 같은 호출 내에서 수집되는 모든 문단에 동일한 `[^n]`과 `{prefix}-{n}`을 사용한다.

## Key Decisions

- `collect_footnote_content` 시그니처에 `note_id: u32`, `id_prefix: &str` 추가.
- `back_link = format!("[^{}]", note_id)`, `unique_id = format!("{}-{}", id_prefix, note_id)` 사용.
- 각주: `collect_footnote_content(..., footnote_id, "footnote")`, 미주: `collect_footnote_content(..., endnote_id, "endnote")`.

## Resolved Questions

- **한 각주에 문단이 여러 개일 때**: 동일한 `note_id`로 같은 backlink/unique_id를 쓰면 됨(한 각주 = 하나의 [^n]).

## Open Questions

- 없음 (버그 수정 범위로 한정).

## References

- HWP 스펙: `.cursor/skills/hwp-spec/4-3-10-4-각주-미주.md`
- 구현: `crates/hwp-core/src/viewer/core/bodytext.rs` (`process_footnote`, `process_endnote`, `collect_footnote_content`)
