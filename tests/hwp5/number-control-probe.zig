const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const id = try r.readInt(u32);
    const v = try core.hwp5.number_control.parse(id, bytes[r.offset..]) orelse return error.UnknownNumberControl;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, id);
    switch (v) {
        .auto => |p| {
            try int(a, &out, u32, p.header.attributes);
            for ([_]u16{ p.header.number, p.symbol, p.prefix, p.suffix }) |n| try int(a, &out, u16, n);
            try out.appendSlice(a, p.extra);
        },
        .restart => |p| {
            try int(a, &out, u32, p.header.attributes);
            try int(a, &out, u16, p.header.number);
            try out.appendSlice(a, p.extra);
        },
    }
    return out.toOwnedSlice(a);
}
