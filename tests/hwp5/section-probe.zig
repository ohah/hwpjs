const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const numbering = try r.readInt(u32);
    const borders = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.section_validation.inspect(tree, version, numbering, borders);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    return out.toOwnedSlice(a);
}
pub fn definition(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, version: core.hwp5.Version) !void {
    const d = try core.hwp5.body.section_def.Definition.parse(bytes, version);
    try int(a, out, u32, d.flags);
    inline for (.{ "column_gap", "vertical_grid", "horizontal_grid" }) |name| try int(a, out, i16, @field(d, name));
    try int(a, out, u32, d.tab_spacing);
    inline for (.{ "numbering_id", "page_start", "picture_start", "table_start", "equation_start" }) |name| try int(a, out, u16, @field(d, name));
    if (d.language) |language| try int(a, out, u16, language);
    try out.appendSlice(a, d.extra);
}
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.body.Value) !void {
    switch (value) {
        .note_shape => |s| {
            try int(a, out, u32, s.flags);
            inline for (.{ "user_char", "prefix", "suffix", "start_number" }) |name| try int(a, out, u16, @field(s, name));
            try int(a, out, i32, s.separator_length);
            inline for (.{ "above", "below", "between" }) |name| try int(a, out, i16, @field(s, name));
            try int(a, out, u8, s.line_type);
            try int(a, out, u8, s.line_width);
            try int(a, out, u32, s.color);
            try out.appendSlice(a, s.extra);
        },
        .page_definition => |d| {
            inline for (.{ "width", "height", "left", "right", "top", "bottom", "header", "footer", "gutter", "flags" }) |name| try int(a, out, u32, @field(d, name));
            try out.appendSlice(a, d.extra);
        },
        .page_border => |d| {
            try int(a, out, u32, d.flags);
            inline for (.{ "left", "right", "top", "bottom" }) |name| try int(a, out, i16, @field(d, name));
            try int(a, out, u16, d.border_fill_id);
            try out.appendSlice(a, d.extra);
        },
        else => unreachable,
    }
}
