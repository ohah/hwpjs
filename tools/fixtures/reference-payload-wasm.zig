//! old Session의 초기 checkpointSize만 관측하는 메모리 전용 진단. 제품 WASM이 아니다.
const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const a = std.heap.wasm_allocator;
var last_error: []const u8 = "";
export fn diagnostic_alloc(len: usize) usize {
    const bytes = a.alloc(u8, len) catch return 0;
    return @intFromPtr(bytes.ptr);
}
export fn diagnostic_free(ptr: usize, len: usize) void {
    a.free(@as([*]u8, @ptrFromInt(ptr))[0..len]);
}
export fn diagnostic_payload_cost(ptr: usize, len: usize) u32 {
    last_error = "";
    const s = edit.Session.open(a, @as([*]const u8, @ptrFromInt(ptr))[0..len]) catch |err| {
        last_error = @errorName(err);
        return 0;
    };
    defer s.close();
    const result = s.checkpointSize(std.math.maxInt(usize)) catch |err| {
        last_error = @errorName(err);
        return 0;
    };
    return @intCast(result);
}
export fn diagnostic_error_pointer() usize {
    return @intFromPtr(last_error.ptr);
}
export fn diagnostic_error_length() usize {
    return last_error.len;
}
