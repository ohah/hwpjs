const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 3) return error.InvalidMode;
    const p = try core.hwp5.drawing_style.Style.parseWithTail(bytes[r.offset..], @enumFromInt(mode & 1), if (mode & 2 != 0) .fill_only else .alpha_shadow);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, switch (p.tail) {
        .unknown => 0,
        .known => 1,
        .fill_only => 2,
    });
    try int(a, &out, u32, p.fill.flags);
    try int(a, &out, u32, p.border.color);
    try int(a, &out, i32, p.border.width);
    try int(a, &out, u32, p.border.attributes.raw);
    try int(a, &out, u32, p.border.outline);
    const extra = switch (p.tail) {
        .unknown => |raw| raw,
        .fill_only => |raw| raw,
        .known => |k| blk: {
            inline for (.{ "pattern", "gradient", "image" }) |f| try int(a, &out, u32, if (@field(k.alpha, f)) |v| v else 256);
            try int(a, &out, u32, k.shadow.kind);
            try int(a, &out, u32, k.shadow.color);
            try int(a, &out, i32, k.shadow.offset_x);
            try int(a, &out, i32, k.shadow.offset_y);
            break :blk k.extra;
        },
    };
    try int(a, &out, u32, @intCast(extra.len));
    try out.appendSlice(a, extra);
    return out.toOwnedSlice(a);
}
