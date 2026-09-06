const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var tokens = try core.hwp5.body.text.Iterator.init(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    while (try tokens.next()) |token| {
        if (token.value != .control or token.value.control.code != 4) continue;
        if (try core.hwp5.memo_end.parse(token.value.control.data)) |end| {
            try int(a, &out, u32, @intCast(token.start_unit));
            try int(a, &out, u32, end.middle_raw);
            try int(a, &out, u32, end.memo_index);
        }
    }
    return out.toOwnedSlice(a);
}
