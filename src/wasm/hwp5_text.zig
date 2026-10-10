const std = @import("std");
const allocator = @import("memory.zig").allocator;
const cfb = @import("cfb.zig");
var output: ?[]u8 = null;
var distribution: bool = false;

export fn hwp5_text_distribution() u32 {
    return @intFromBool(distribution);
}

export fn hwp5_text_free() void {
    if (output) |bytes| allocator.free(bytes);
    output = null;
    distribution = false;
}
export fn hwp5_text_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwp5_text_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwp5_text_read(ptr: [*]const u8, size: usize) u32 {
    hwp5_text_free();
    if (size > 64 * 1024 * 1024) {
        _ = cfb.fail(error.LimitExceeded);
        return 0;
    }
    const encoded = @import("../hwp5/text_preview.zig").encodeDetailed(allocator, ptr[0..size]) catch |err| {
        _ = cfb.fail(err);
        return 0;
    };
    output = encoded.bytes;
    distribution = encoded.distribution;
    return 1;
}
