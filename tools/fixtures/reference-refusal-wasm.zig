//! old 이력의 초기화/적용 거부 단계를 구분하는 메모리 전용 후속 진단.
const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const history = @import("hwp5/edit/editor_history.zig");
const a = std.heap.wasm_allocator;
var last_error: []const u8 = "";
var saved: []u8 = &.{};
var revision: u32 = std.math.maxInt(u32);
var attempted: bool = false;
export fn diagnostic_alloc(len: usize) usize {
    return @intFromPtr((a.alloc(u8, len) catch return 0).ptr);
}
export fn diagnostic_free(ptr: usize, len: usize) void {
    a.free(@as([*]u8, @ptrFromInt(ptr))[0..len]);
}
fn keepSave(s: *edit.Session) bool {
    saved = (s.save(a, .{ .allow_stale_layout = true }) catch |err| {
        last_error = @errorName(err);
        return false;
    }).bytes;
    return true;
}
export fn diagnostic_refusal(ptr: usize, len: usize, cap: u32) u32 {
    if (saved.len != 0) a.free(saved);
    saved = &.{};
    last_error = "";
    revision = std.math.maxInt(u32);
    attempted = false;
    const s = edit.Session.open(a, @as([*]const u8, @ptrFromInt(ptr))[0..len]) catch |err| {
        last_error = @errorName(err);
        return 10;
    };
    defer s.close();
    var h = history.History.initV2(a, s, .{ .max_checkpoint_bytes = cap }) catch |err| {
        last_error = @errorName(err);
        if (!keepSave(s)) return 11;
        return 1;
    };
    defer h.deinit();
    revision = h.revision();
    attempted = true;
    _ = h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }) catch |err| {
        last_error = @errorName(err);
        revision = h.revision();
        if (!keepSave(s)) return 12;
        return 2;
    };
    revision = h.revision();
    if (!keepSave(s)) return 13;
    return 3;
}
export fn diagnostic_revision() u32 {
    return revision;
}
export fn diagnostic_attempted() u32 {
    return @intFromBool(attempted);
}
export fn diagnostic_error_pointer() usize {
    return @intFromPtr(last_error.ptr);
}
export fn diagnostic_error_length() usize {
    return last_error.len;
}
export fn diagnostic_saved_pointer() usize {
    return @intFromPtr(saved.ptr);
}
export fn diagnostic_saved_length() usize {
    return saved.len;
}
