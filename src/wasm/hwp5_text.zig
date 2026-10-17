const std = @import("std");
const allocator = @import("memory.zig").allocator;
const cfb = @import("cfb.zig");
var output: ?[]u8 = null;
var distribution: bool = false;
var declared_sections: u16 = 0;

export fn hwp5_text_declared_sections() u32 {
    return declared_sections;
}

export fn hwp5_text_distribution() u32 {
    return @intFromBool(distribution);
}

export fn hwp5_text_free() void {
    if (output) |bytes| allocator.free(bytes);
    output = null;
    distribution = false;
    declared_sections = 0;
}
export fn hwp5_text_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwp5_text_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwp5_text_read(ptr: [*]const u8, size: usize) u32 {
    return read(ptr, size, false);
}
export fn hwp5_text_read_available(ptr: [*]const u8, size: usize) u32 {
    return read(ptr, size, true);
}
fn read(ptr: [*]const u8, size: usize, available_only: bool) u32 {
    hwp5_text_free();
    if (size > 64 * 1024 * 1024) {
        _ = cfb.fail(error.LimitExceeded);
        return 0;
    }
    const preview = @import("../hwp5/text_preview.zig");
    const encoded = (if (available_only) preview.encodeAvailableDetailed(allocator, ptr[0..size]) else preview.encodeDetailed(allocator, ptr[0..size])) catch |err| {
        _ = cfb.fail(err);
        return 0;
    };
    output = encoded.bytes;
    distribution = encoded.distribution;
    declared_sections = encoded.declared_sections;
    return 1;
}
