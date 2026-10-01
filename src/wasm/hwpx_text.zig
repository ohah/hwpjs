const allocator = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
var output: ?[]u8 = null;

export fn hwpx_text_free() void {
    if (output) |bytes| allocator.free(bytes);
    output = null;
}
export fn hwpx_text_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwpx_text_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwpx_text_read(ptr: [*]const u8, size: usize) u32 {
    hwpx_text_free();
    if (size > 64 * 1024 * 1024) {
        _ = errors.fail(error.LimitExceeded);
        return 0;
    }
    output = @import("../hwpx/text_preview.zig").encode(allocator, ptr[0..size]) catch |err| {
        _ = errors.fail(err);
        return 0;
    };
    return 1;
}
