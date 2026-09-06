const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    const d = try core.hwp5.body.column_def.Definition.parse(bytes);
    try int(a, out, u16, d.flags_low);
    if (d.spacing) |gap| try int(a, out, i16, gap);
    try int(a, out, u16, d.flags_high);
    if (d.columns) |cols| for (0..cols.count()) |i| {
        const col = cols.get(i).?;
        try int(a, out, u16, col.width);
        try int(a, out, u16, col.gap);
    };
    try int(a, out, u8, d.line_type);
    try int(a, out, u8, d.line_width);
    try int(a, out, u32, d.color);
    try out.appendSlice(a, d.extra);
}
pub fn fields(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const d = try core.hwp5.body.column_def.Definition.parse(bytes);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, d.count());
    try int(a, &out, u32, @intFromBool(d.sameWidth()));
    try int(a, &out, i32, if (d.spacing) |gap| gap else std.math.minInt(i32));
    if (d.columns) |cols| for (0..cols.count()) |i| {
        const col = cols.get(i).?;
        try int(a, &out, u32, col.width);
        try int(a, &out, u32, col.gap);
    };
    return out.toOwnedSlice(a);
}
