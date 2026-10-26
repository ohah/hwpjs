//! Source subList display enums; no defaults or layout calculations.
const std = @import("std");
const lists = @import("para_list_attributes.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Values = struct { text_direction: ?u32, line_wrap: ?u32, vertical_alignment: ?u32 };

pub fn read(a: std.mem.Allocator, tree: *const Tree, list: usize) !Values {
    var attrs = try lists.readTree(a, tree, list, 4096);
    defer attrs.deinit(a);
    return .{
        .text_direction = if (attrs.get(.text_direction)) |v| lists.enumIndex(.text_direction, v) orelse return error.UnsupportedTableCellTextDirection else null,
        .line_wrap = if (attrs.get(.line_wrap)) |v| lists.enumIndex(.line_wrap, v) orelse return error.UnsupportedTableCellLineWrap else null,
        .vertical_alignment = if (attrs.get(.vert_align)) |v| lists.enumIndex(.vert_align, v) orelse return error.UnsupportedTableCellVerticalAlignment else null,
    };
}

test "HWPX cell list display enums preserve absence and reject future values" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:subList textDirection='HORIZONTAL' lineWrap='SQUEEZE' vertAlign='CENTER'/><p:subList/><p:subList lineWrap='FUTURE'/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Values{ .text_direction = 0, .line_wrap = 1, .vertical_alignment = 1 }, try read(a, &tree, 1));
    try std.testing.expectEqualDeep(Values{ .text_direction = null, .line_wrap = null, .vertical_alignment = null }, try read(a, &tree, 2));
    try std.testing.expectError(error.UnsupportedTableCellLineWrap, read(a, &tree, 3));
}
