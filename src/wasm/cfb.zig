const cfb = @import("../cfb/reader.zig");
const allocator = @import("memory.zig").allocator;
var active: ?cfb.File = null;
var last_error: []const u8 = "";
pub fn fail(err: anyerror) i32 {
    last_error = @errorName(err);
    return -2;
}
pub fn get() ?*cfb.File {
    return if (active) |*file| file else null;
}
export fn cfb_close() void {
    if (active) |*file| file.deinit();
    active = null;
}
export fn cfb_open(ptr: [*]const u8, size: usize) u32 {
    cfb_close();
    active = cfb.File.open(allocator, ptr[0..size], .{}) catch |err| {
        last_error = @errorName(err);
        return 0;
    };
    last_error = "";
    return 1;
}
export fn cfb_error_ptr() [*]const u8 {
    return last_error.ptr;
}
export fn cfb_error_len() usize {
    return last_error.len;
}
export fn cfb_count() usize {
    return if (active) |file| file.entries.len else 0;
}

export fn cfb_find(ptr: [*]const u8, size: usize) i32 {
    const file = if (active) |*f| f else return -1;
    const found = file.find(allocator, ptr[0..size]) catch |err| return fail(err);
    return if (found) |index| @intCast(index) else -1;
}
