const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const options = try @import("document-probe.zig").readStyle(&r);
    const p = try core.hwp5.drawing_style.Style.parseWithTail(bytes[r.offset..], options.border, options.tail);
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
            if (k.metadata) |m| {
                try int(a, &out, u32, m.instance_id);
                try int(a, &out, u32, m.reserved);
                try int(a, &out, u32, m.shadow_alpha);
            }
            break :blk k.extra;
        },
    };
    try int(a, &out, u32, @intCast(extra.len));
    try out.appendSlice(a, extra);
    return out.toOwnedSlice(a);
}
