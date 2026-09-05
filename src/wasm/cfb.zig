const cfb = @import("../cfb/reader.zig");
const allocator = @import("memory.zig").allocator;
const header = @import("../cfb/header.zig");
var active: ?cfb.File = null;
var last_error: []const u8 = "";
var last_code: []const u8 = "";
var diagnostic: header.Diagnostic = .{};
pub fn fail(err: anyerror) i32 {
    last_error = @errorName(err);
    last_code = @errorName(err);
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
        last_code = @errorName(err);
        // Reuse core validation, never reimplement header checks in the JS adapter.
        _ = header.Header.parseDiagnostic(ptr[0..size], &diagnostic) catch |header_error| {
            if (header_error == err and diagnostic.message.len != 0) last_error = diagnostic.message;
            return 0;
        };
        return 0;
    };
    last_error = "";
    last_code = "";
    return 1;
}
export fn cfb_error_ptr() [*]const u8 {
    return last_error.ptr;
}
export fn cfb_error_len() usize {
    return last_error.len;
}
export fn cfb_error_code_ptr() [*]const u8 {
    return last_code.ptr;
}
export fn cfb_error_code_len() usize {
    return last_code.len;
}
export fn cfb_count() usize {
    return if (active) |file| file.entries.len else 0;
}

export fn cfb_find(ptr: [*]const u8, size: usize) i32 {
    const file = if (active) |*f| f else return -1;
    const found = file.find(allocator, ptr[0..size]) catch |err| return fail(err);
    return if (found) |index| @intCast(index) else -1;
}
