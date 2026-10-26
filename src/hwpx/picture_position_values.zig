//! 기존 크기/offset과 별도로 배치 기준·정렬·흐름 원값만 소유합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const specs = @import("shape_xml_fields.zig").position_specs;
pub const Values = struct {
    // affectLSpacing, flowWithText, allowOverlap, holdAnchorAndSO.
    flags: [4]?bool = @splat(null),
    // vertRelTo, horzRelTo, vertAlign, horzAlign.
    relations: [4]?u32 = @splat(null),
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    return readComponent(a, tree, picture);
}

pub fn readLine(a: std.mem.Allocator, tree: *const Tree, line: usize) !Values {
    if (line >= tree.elements.len or !fields.childIs(tree, line, "line")) return error.InvalidLineGeometryNode;
    return readComponent(a, tree, line);
}

pub fn readChart(a: std.mem.Allocator, tree: *const Tree, chart: usize) !Values {
    if (chart >= tree.elements.len or !fields.childIs(tree, chart, "chart")) return error.InvalidChartGeometryNode;
    return readComponent(a, tree, chart);
}
pub fn readOle(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "ole")) return error.InvalidOleDisplayNode;
    return readComponent(a, tree, node);
}
pub fn readConnector(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "connectLine")) return error.InvalidConnectorGeometryNode;
    return readComponent(a, tree, node);
}

pub fn readCurve(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "curve")) return error.InvalidCurveGeometryNode;
    return readComponent(a, tree, node);
}

pub fn readEllipse(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "ellipse")) return error.InvalidEllipseGeometryNode;
    return readComponent(a, tree, node);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize) !Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingTextNode;
    return readComponent(a, tree, rectangle);
}

pub fn readContainer(a: std.mem.Allocator, tree: *const Tree, container: usize) !Values {
    if (container >= tree.elements.len or !fields.childIs(tree, container, "container")) return error.InvalidContainerGeometryNode;
    return readComponent(a, tree, container);
}
pub fn readForm(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    const kind = @import("run_anchor.zig").kind(tree, node) orelse return error.InvalidFormNode;
    if (!@import("run_anchor.zig").isForm(kind)) return error.InvalidFormNode;
    return readComponent(a, tree, node);
}

fn readComponent(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const position = fields.uniqueChild(tree, picture, "pos", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    const node = position orelse return .{};
    var result: Values = .{};
    for (specs[1..5], 0..) |spec, index| {
        if (try tree.attributeValue(a, node, "", spec.name)) |raw| result.flags[index] = try fields.boolean(a, raw, 4096);
    }
    for (specs[5..9], 0..) |spec, index| result.relations[index] = try @import("picture_enum_value.zig").read(a, tree, node, spec);
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:pos affectLSpacing='false' flowWithText='1' vertRelTo='PARA' horzRelTo='COLUMN' vertAlign='TOP' horzAlign='LEFT'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqualDeep([4]?bool{ false, true, null, null }, value.flags);
    try std.testing.expectEqualDeep([4]?u32{ 2, 2, 0, 0 }, value.relations);
}

test "HWPX picture position preserves missing flow and zero alignment with allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture position rejects unknown reference and duplicate position" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic>";
    inline for (.{ .{ "<p:pos/><p:pos/>", error.DuplicatePictureGeometryChild }, .{ "<p:pos vertRelTo='COLUMN'/>", error.UnsupportedPictureGeometryEnum } }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], read(a, &tree, 1));
    }
}
