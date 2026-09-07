const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const v = try core.hwp5.history.date.View.parseObserved(bytes);
    const d = v.diagnostics();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(v.fields))) |f| try int(a, &out, u16, @field(v.fields, f.name));
    try int(a, &out, u32, d.invalid_fields);
    for ([_]?bool{ d.calendar_valid, d.weekday_matches }) |b| try int(a, &out, u32, if (b) |yes| (if (yes) 1 else 2) else 0);
    try int(a, &out, u32, @intCast(v.extra.len));
    try out.appendSlice(a, v.extra);
    return out.toOwnedSlice(a);
}
