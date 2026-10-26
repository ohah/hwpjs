//! Table adapter to the shared shape size/position reader; no layout defaults.
const shared = @import("picture_geometry_values.zig");
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const specs = @import("shape_xml_fields.zig");
const enums = @import("picture_enum_value.zig");
pub const Values = struct {
    geometry: shared.Values,
    z_order: ?i64 = null,
    text_wrap: ?u32 = null,
    text_flow: ?u32 = null,
    affect_line_spacing: ?bool = null,
    flow_with_text: ?bool = null,
    allow_overlap: ?bool = null,
    hold_anchor: ?bool = null,
    vertical_relative: ?u32 = null,
    horizontal_relative: ?u32 = null,
    vertical_alignment: ?u32 = null,
    horizontal_alignment: ?u32 = null,
    out_margin: ?[4]?i64 = null,
    in_margin: ?[4]?i64 = null,
};

fn child(tree: *const Tree, table: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, table, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateTableGeometryChild;
    return node;
}

fn boolean(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?bool {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try fields.boolean(a, raw, 4096);
}

fn margin(a: std.mem.Allocator, tree: *const Tree, table: usize, name: []const u8) !?[4]?i64 {
    const node = (try child(tree, table, name)) orelse return null;
    var result: [4]?i64 = @splat(null);
    for (fields.margin_names, 0..) |field, index| {
        if (try tree.attributeValue(a, node, "", field)) |raw| result[index] = try fields.margin(a, raw, 4096);
    }
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, table: usize) !Values {
    var result = Values{ .geometry = try shared.readTable(a, tree, table) };
    result.z_order = try @import("picture_flow_values.zig").readZOrder(a, tree, table);
    result.text_wrap = try enums.readExtended(a, tree, table, specs.table_specs[3]);
    result.text_flow = try enums.read(a, tree, table, specs.table_specs[4]);
    if (try child(tree, table, "pos")) |node| {
        result.affect_line_spacing = try boolean(a, tree, node, specs.position_specs[1].name);
        result.flow_with_text = try boolean(a, tree, node, specs.position_specs[2].name);
        result.allow_overlap = try boolean(a, tree, node, specs.position_specs[3].name);
        result.hold_anchor = try boolean(a, tree, node, specs.position_specs[4].name);
        result.vertical_relative = try enums.read(a, tree, node, specs.position_specs[5]);
        result.horizontal_relative = try enums.read(a, tree, node, specs.position_specs[6]);
        result.vertical_alignment = try enums.read(a, tree, node, specs.position_specs[7]);
        result.horizontal_alignment = try enums.read(a, tree, node, specs.position_specs[8]);
    }
    result.out_margin = try margin(a, tree, table, "outMargin");
    result.in_margin = try margin(a, tree, table, "inMargin");
    return result;
}

test "HWPX table complete placement actual values and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    for (tree.elements, 0..) |_, node| {
        if (!fields.childIs(tree, node, "tbl")) continue;
        const value = try read(a, tree, node);
        try std.testing.expectEqual(@as(?u32, 1), value.text_wrap);
        try std.testing.expectEqual(@as(?u32, 0), value.text_flow);
        try std.testing.expectEqual(@as(?bool, true), value.flow_with_text);
        try std.testing.expectEqual(@as(?bool, false), value.allow_overlap);
        try std.testing.expectEqual(@as(?u32, 2), value.vertical_relative);
        try std.testing.expectEqual(@as(?u32, 2), value.horizontal_relative);
        try std.testing.expectEqualDeep(@as(?[4]?i64, .{ 283, 283, 283, 283 }), value.out_margin);
        try std.testing.expectEqualDeep(@as(?[4]?i64, .{ 141, 141, 141, 141 }), value.in_margin);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize, expected: Values) !void {
                try std.testing.expectEqualDeep(expected, try read(allocator, source, index));
            }
        }.run, .{ tree, node, value });
        return;
    }
    return error.MissingTable;
}

test "HWPX table complete placement distinguishes missing empty and duplicate margins" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl/><p:tbl><p:inMargin/></p:tbl><p:tbl><p:outMargin/><p:outMargin/></p:tbl></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const absent = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?[4]?i64, null), absent.in_margin);
    try std.testing.expectEqual(@as(?bool, null), absent.flow_with_text);
    try std.testing.expectEqual(@as(?u32, null), absent.text_wrap);
    try std.testing.expectEqual(@as(?u32, null), absent.text_flow);
    try std.testing.expectEqual(@as(?i64, null), absent.z_order);
    const empty = try read(a, &tree, 2);
    try std.testing.expectEqualDeep(@as(?[4]?i64, .{ null, null, null, null }), empty.in_margin);
    try std.testing.expectError(error.DuplicateTableGeometryChild, read(a, &tree, 4));
}

test "HWPX table complete placement preserves signed unsigned and absent source z order" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl zOrder='0'/><p:tbl zOrder='-1'/><p:tbl zOrder='4294967295'/><p:tbl zOrder='-2147483649'/><p:tbl zOrder='4294967296'/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?i64, 0), (try read(a, &tree, 1)).z_order);
    try std.testing.expectEqual(@as(?i64, -1), (try read(a, &tree, 2)).z_order);
    try std.testing.expectEqual(@as(?i64, 4294967295), (try read(a, &tree, 3)).z_order);
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, read(a, &tree, 4));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, read(a, &tree, 5));
    const expected = try read(a, &tree, 3);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize, value: Values) !void {
            try std.testing.expectEqualDeep(value, try read(allocator, source, index));
        }
    }.run, .{ &tree, @as(usize, 3), expected });
}

test "HWPX table complete placement reads wrap extensions and rejects unknown policy" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl textWrap='TIGHT' textFlow='RIGHT_ONLY'/><p:tbl textWrap='THROUGH'/><p:tbl textWrap='FUTURE'/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const first = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 4), first.text_wrap);
    try std.testing.expectEqual(@as(?u32, 2), first.text_flow);
    try std.testing.expectEqual(@as(?u32, 5), (try read(a, &tree, 2)).text_wrap);
    try std.testing.expectError(error.UnsupportedPictureGeometryEnum, read(a, &tree, 3));
}
