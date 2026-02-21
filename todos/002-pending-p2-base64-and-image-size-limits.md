---
status: resolved
priority: p2
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# P2: Base64·이미지 디코딩 크기 한도

## Problem Statement

HWP BinData는 신뢰할 수 없는 입력인데, Base64 디코딩·이미지 로드 시 **길이/용량 상한이 없어** 매우 큰 입력으로 메모리 DoS 가능.

## Findings

- **Base64**: `crates/hwp-core/src/viewer/pdf/mod.rs` `decode_bindata_base64` — 디코딩 전/후 길이 제한 없음.
- **이미지**: `image::load_from_memory(&decoded)` — image crate 기본 한도는 있으나, `Limits`(max_image_width/height, max_alloc)를 명시하지 않음. untrusted 입력에 대한 정책이 없음.

## Proposed Solutions

1. **Base64**: 디코딩 전 입력 길이 상한(예: 4 * max_decoded_len) 또는 디코딩 후 `decoded.len()` 상한 두고 초과 시 `Err`.  
   **Effort**: Small. **Risk**: Low.

2. **이미지**: `image` crate의 `Limits`로 `max_image_width`, `max_image_height`, `max_alloc` 설정한 디코더 사용.  
   **Effort**: Small. **Risk**: Low.

3. **둘 다 적용** (권장).

## Recommended Action

(트리아지 시 결정)

## Technical Details

- **파일**: `crates/hwp-core/src/viewer/pdf/mod.rs` (decode_bindata_base64, try_build_image)
- **참고**: [image crate Limits](https://docs.rs/image/latest/image/struct.Limits.html)

## Acceptance Criteria

- [x] Base64 디코딩 결과 길이(또는 입력 길이) 상한 정의 및 초과 시 실패
- [x] 이미지 로드 시 Limits 설정으로 최대 해상도/할당량 제한
- [x] 기존 정상 픽스처(테이블·이미지) 테스트 통과

## Work Log

| 날짜 | 작업 | 비고 |
|------|------|------|
| (리뷰일) | 코드 리뷰에서 발견 | security-sentinel |
| 2025-02-21 | MAX_BASE64_INPUT_LEN/MAX_IMAGE_DECODED_LEN, try_build_image에서 상한 검사 | resolve_todo_parallel |

## Resources

- PR: https://github.com/ohah/hwpjs/pull/10
