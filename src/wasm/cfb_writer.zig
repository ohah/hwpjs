const std = @import("std");
const allocator = @import("memory.zig").allocator;
const cfb = @import("cfb.zig");
const wire = @import("document_wire.zig");
var output: ?[]u8 = null;
export fn cfb_output_free() void {
    if (output) |bytes| allocator.free(bytes);
    output = null;
}
export fn cfb_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn cfb_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn cfb_write(ptr: [*]const u8, size: usize) u32 {
    cfb_output_free();
    if (size > 256 * 1024 * 1024) {
        _ = cfb.fail(error.LimitExceeded);
        return 0;
    }
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const doc = wire.decode(arena.allocator(), ptr[0..size]) catch |err| {
        _ = cfb.fail(err);
        return 0;
    };
    output = @import("../cfb/writer.zig").write(allocator, doc.nodes, .{ .version = doc.version }) catch |err| {
        _ = cfb.fail(err);
        return 0;
    };
    return 1;
}
export fn cfb_document() u32 {
    cfb_output_free();
    const file = cfb.get() orelse {
        _ = cfb.fail(error.NoDocument);
        return 0;
    };
    output = wire.encode(allocator, file) catch |err| {
        _ = cfb.fail(err);
        return 0;
    };
    return 1;
}
