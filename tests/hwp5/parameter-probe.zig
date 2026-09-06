const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidParameterLayout;
    var doc = try core.hwp5.parameters.Document.parse(a, bytes[r.offset..], .{ .header_layout = if (mode == 0) .observed6 else .spec4, .null_layout = if (mode == 0) .observed_empty else .spec_u32, .max_nodes = limit });
    defer doc.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (doc.nodes) |n| {
        if (n.id_on_wire) try int(a, &out, u16, n.item_id.?);
        if (n.wire_type) |kind| try int(a, &out, u16, kind);
        switch (n.value) {
            .set => |s| {
                try int(a, &out, u16, s.id);
                try int(a, &out, u16, s.count);
                if (s.reserved) |v| try int(a, &out, u16, v);
            },
            .array => |ar| {
                try int(a, &out, u16, ar.count);
                if (ar.shared_id) |id| try int(a, &out, u16, id);
            },
            .null_value => |v| if (v) |raw| try int(a, &out, u32, raw),
            .integer => |v| try int(a, &out, u32, v),
            .binary_id => |v| try int(a, &out, u16, v),
            .string => |s| {
                try int(a, &out, u16, @intCast(s.len / 2));
                try out.appendSlice(a, s);
            },
        }
    }
    try out.appendSlice(a, doc.extra);
    return out.toOwnedSlice(a);
}
pub fn field(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const e = try core.hwp5.body.CellExtension.parse(bytes);
    const result = (try core.hwp5.body.cell_field.inspect(a, e, .{ .header_layout = .observed6, .null_layout = .observed_empty, .max_nodes = limit })) orelse return a.alloc(u8, 0);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const name = result.field_name_utf16 orelse &.{};
    for ([_]u32{ @intFromBool(result.field_name_utf16 != null), @intCast(name.len), @intFromBool(result.recognized_set), @intCast(result.parameter_nodes), @intCast(result.extra.len) }) |v| try int(a, &out, u32, v);
    try out.appendSlice(a, name);
    try out.appendSlice(a, result.extra);
    return out.toOwnedSlice(a);
}
