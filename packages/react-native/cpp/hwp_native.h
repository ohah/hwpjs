#ifndef HWPJS_NATIVE_ABI_H
#define HWPJS_NATIVE_ABI_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Experimental ABI v1. Pointer is C++ only. Never encode it as a JS number. */
typedef struct HwpNativeBridge HwpNativeBridge;
typedef struct { uint32_t slot, generation; } HwpNativeToken;
typedef struct {
  HwpNativeToken token, owner;
  size_t length;
  /* reflow: 0=no, 1=yes, 2=not reported by backend. */
  uint32_t revision, encoding, layout_requires_reflow;
} HwpNativeBuffer;
typedef struct {
  uint32_t revision, epoch, history_revision, undo_count, redo_count;
} HwpNativeState;
typedef struct {
  uint32_t version, struct_size, token_size, buffer_size, state_size, pointer_bits;
} HwpNativeAbiInfo;
typedef int32_t HwpNativeStatus;
enum {
  HWP_NATIVE_OK = 0, HWP_NATIVE_NO_OP = 1, HWP_NATIVE_INVALID_ARGUMENT = 2,
  HWP_NATIVE_STALE_HANDLE = 3, HWP_NATIVE_STALE_REVISION = 4,
  HWP_NATIVE_BUSY = 5, HWP_NATIVE_OUT_OF_MEMORY = 6,
  HWP_NATIVE_BACKEND_ERROR = 7, HWP_NATIVE_LIMIT_EXCEEDED = 8,
  HWP_NATIVE_STALE_BUFFER = 9, HWP_NATIVE_INDETERMINATE = 10
};
enum { HWP_NATIVE_HWP5 = 1, HWP_NATIVE_HWPX = 2 };
HwpNativeStatus hwp_native_abi_info(HwpNativeAbiInfo *, size_t);
HwpNativeStatus hwp_native_bridge_create(uint32_t version, HwpNativeBridge **);
/* Destroy only once, after invalidation and joining all calls. */
HwpNativeStatus hwp_native_bridge_destroy(HwpNativeBridge *);
/* Every token is bound to the bridge that created it; do not mix bridges. */
HwpNativeStatus hwp_native_open(HwpNativeBridge *, uint32_t format, const uint8_t *, size_t, HwpNativeToken *);
HwpNativeStatus hwp_native_close(HwpNativeBridge *, HwpNativeToken);
HwpNativeStatus hwp_native_state(HwpNativeBridge *, HwpNativeToken, HwpNativeState *, size_t);
/* Low-level coordinates: HWP5 paragraph section-local 0-based, HWPX native
   document-wide 1-based. Existing JS facade owns the public conversion. */
/* Read encoding: HWP5 original UTF-16LE tokens INCLUDING terminator; HWPX
   anchor-text UTF-8. This is not a universal display snapshot formatter. */
HwpNativeStatus hwp_native_read(HwpNativeBridge *, HwpNativeToken, uint32_t section, uint32_t paragraph, HwpNativeBuffer *, size_t);
HwpNativeStatus hwp_native_save(HwpNativeBridge *, HwpNativeToken, uint32_t expected_revision, uint32_t allow_stale_layout, HwpNativeBuffer *, size_t);
HwpNativeStatus hwp_native_splice(HwpNativeBridge *, HwpNativeToken, uint32_t expected_revision, uint32_t section, uint32_t paragraph, uint32_t start_utf16, uint32_t deleted_utf16, const uint8_t *inserted_utf8, size_t);
HwpNativeStatus hwp_native_history(HwpNativeBridge *, HwpNativeToken, uint32_t expected_revision, uint32_t redo);
HwpNativeStatus hwp_native_error_copy(HwpNativeBridge *, HwpNativeToken, HwpNativeBuffer *, size_t);
/* Results survive later operations and document close. Copy then release.
   Destroy frees unreleased results. No view into native memory is returned. */
HwpNativeStatus hwp_native_buffer_copy(HwpNativeBridge *, HwpNativeToken buffer, uint8_t *destination, size_t capacity, size_t *written);
HwpNativeStatus hwp_native_buffer_release(HwpNativeBridge *, HwpNativeToken buffer);
#ifdef __cplusplus
}
#endif
#endif

#ifdef HWPJS_NATIVE_SHARED_SNAPSHOT
/* Additive common-format owned JSON; uses the existing buffer copy/release API. */
#ifdef __cplusplus
extern "C" {
#endif
HwpNativeStatus hwp_native_snapshot(HwpNativeBridge *, HwpNativeToken, HwpNativeBuffer *, size_t);
#ifdef __cplusplus
}
#endif
#endif
