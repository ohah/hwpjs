//! Explicit paraHead layout attributes shared by numbering and character bullets.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const Allocator = std.mem.Allocator;

pub const Placement = struct {
    alignment: enum { LEFT, CENTER, RIGHT },
    use_instance_width: bool,
    auto_indent: bool,
    width_adjust: i32,
    offset_type: enum { PERCENT, HWPUNIT },
    text_offset: i32,
    char_shape_id: u32,
};

pub fn read(a: Allocator, tree: *const Tree, node: usize) !?Placement {
    return observed(a, tree, node) catch |err| switch (err) {
        error.OutOfMemory => err,
        else => null,
    };
}

fn observed(a: Allocator, tree: *const Tree, node: usize) !?Placement {
    const alignment = (try tree.attributeValue(a, node, "", "align")) orelse return null;
    const use_width = (try tree.attributeValue(a, node, "", "useInstWidth")) orelse return null;
    const auto_indent = (try tree.attributeValue(a, node, "", "autoIndent")) orelse return null;
    const adjust = (try tree.attributeValue(a, node, "", "widthAdjust")) orelse return null;
    const offset_type = (try tree.attributeValue(a, node, "", "textOffsetType")) orelse return null;
    const offset = (try tree.attributeValue(a, node, "", "textOffset")) orelse return null;
    const char_id = (try fields.optionalUnsigned(a, tree, node, "charPrIDRef", 64)) orelse return null;
    const align_value = try alignment.toUtf8(a, 16);
    defer a.free(align_value);
    const offset_value = try offset_type.toUtf8(a, 16);
    defer a.free(offset_value);
    return .{
        .alignment = std.meta.stringToEnum(@FieldType(Placement, "alignment"), align_value) orelse return null,
        .use_instance_width = try fields.boolean(a, use_width, 64),
        .auto_indent = try fields.boolean(a, auto_indent, 64),
        .width_adjust = std.math.cast(i32, try fields.margin(a, adjust, 64)) orelse return null,
        .offset_type = std.meta.stringToEnum(@FieldType(Placement, "offset_type"), offset_value) orelse return null,
        .text_offset = std.math.cast(i32, try fields.margin(a, offset, 64)) orelse return null,
        .char_shape_id = char_id,
    };
}

test "paragraph marker placement retains explicit alignment widths and offset units" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraHead align='CENTER' useInstWidth='0' autoIndent='1' widthAdjust='-50' textOffsetType='HWPUNIT' textOffset='750' charPrIDRef='4294967295'/><h:paraHead align='RIGHT'/></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: Allocator, header: *const Tree) !void {
            const p = (try read(allocator, header, 1)).?;
            try std.testing.expectEqual(.CENTER, p.alignment);
            try std.testing.expect(!p.use_instance_width and p.auto_indent);
            try std.testing.expectEqual(@as(i32, -50), p.width_adjust);
            try std.testing.expectEqual(.HWPUNIT, p.offset_type);
            try std.testing.expectEqual(@as(i32, 750), p.text_offset);
            try std.testing.expectEqual(@as(u32, 0xffffffff), p.char_shape_id);
            try std.testing.expectEqual(@as(?Placement, null), try read(allocator, header, 2));
        }
    }.run, .{&tree});
}
