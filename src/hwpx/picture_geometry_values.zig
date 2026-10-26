//! 그림 크기와 기준 위치의 원값입니다. 실제 쪽 배치는 계산하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const specs = @import("shape_xml_fields.zig");
pub const Values = struct {
    width: ?u32 = null,
    height: ?u32 = null,
    width_relative: ?u32 = null,
    height_relative: ?u32 = null,
    treat_as_character: ?bool = null,
    horizontal_offset: ?i64 = null,
    vertical_offset: ?i64 = null,
};

fn child(tree: *const Tree, parent: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, parent, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureGeometryChild;
    return result;
}

const relative = @import("picture_enum_value.zig").read;

fn offset(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?i64 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try fields.margin(a, raw, 4096);
}

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

pub fn readTable(a: std.mem.Allocator, tree: *const Tree, table: usize) !Values {
    if (table >= tree.elements.len or !fields.childIs(tree, table, "tbl")) return error.InvalidTableGeometryNode;
    return readComponent(a, tree, table);
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
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidRectangleGeometryNode;
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
    var result: Values = .{};
    if (try child(tree, picture, "sz")) |size| {
        const dimensions = try fields.optionalUnsignedPair(a, tree, size, .{ "width", "height" }, 4096);
        result.width = dimensions[0];
        result.height = dimensions[1];
        result.width_relative = try relative(a, tree, size, specs.size_specs[1]);
        result.height_relative = try relative(a, tree, size, specs.size_specs[3]);
    }
    if (try child(tree, picture, "pos")) |position| {
        if (try tree.attributeValue(a, position, "", specs.position_specs[0].name)) |raw| result.treat_as_character = try fields.boolean(a, raw, 4096);
        result.vertical_offset = try offset(a, tree, position, specs.position_specs[9].name);
        result.horizontal_offset = try offset(a, tree, position, specs.position_specs[10].name);
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:pic><p:curSz width='999'/><x:sz height='999'/><p:sz width='&#48;' widthRelTo='ABSOLUTE'/><p:pos treatAsChar='false' horzOffset='-1' vertOffset='4294967295'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const result = try read(a, &tree, 1);
    try std.testing.expectEqual(@as(?u32, 0), result.width);
    try std.testing.expectEqual(@as(?u32, null), result.height);
    try std.testing.expectEqual(@as(?u32, 4), result.width_relative);
    try std.testing.expectEqual(@as(?bool, false), result.treat_as_character);
    try std.testing.expectEqual(@as(?i64, -1), result.horizontal_offset);
    try std.testing.expectEqual(@as(?i64, 4294967295), result.vertical_offset);
}

test "HWPX container shared geometry rejects foreign nodes duplicates and invalid values" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'>";
    var foreign = try @import("section_tree.zig").parse(a, prefix ++ "<x:container/></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectError(error.InvalidContainerGeometryNode, readContainer(a, &foreign, 1));
    try std.testing.expectError(error.InvalidContainerGeometryNode, @import("picture_position_values.zig").readContainer(a, &foreign, 1));
    inline for (.{
        .{ "<p:sz/><p:sz/>", error.DuplicatePictureGeometryChild },
        .{ "<p:pos/><p:pos/>", error.DuplicatePictureGeometryChild },
        .{ "<p:sz widthRelTo='unknown'/>", error.UnsupportedPictureGeometryEnum },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:container>" ++ case[0] ++ "</p:container></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], readContainer(a, &tree, 1));
    }
    var missing = try @import("section_tree.zig").parse(a, prefix ++ "<p:container><x:sz width='999'/><x:pos allowOverlap='true'/></p:container></s:sec>", 0, 0, .{});
    defer missing.deinit(a);
    try std.testing.expectEqualDeep(Values{}, try readContainer(a, &missing, 1));
    try std.testing.expectEqualDeep(@import("picture_position_values.zig").Values{}, try @import("picture_position_values.zig").readContainer(a, &missing, 1));
}

test "HWPX container shared geometry preserves root values and nested absence" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
            defer a.free(bytes);
            var session = try @import("editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            const tree = &session.sections[0].tree;
            var count: usize = 0;
            for (tree.elements, 0..) |_, node| {
                if (!fields.childIs(tree, node, "container")) continue;
                const value = try readContainer(a, tree, node);
                const position = try @import("picture_position_values.zig").readContainer(a, tree, node);
                if (count == 0) {
                    try std.testing.expectEqual(@as(?u32, 59528), value.width);
                    try std.testing.expectEqual(@as(?u32, 58392), value.height);
                    try std.testing.expectEqual(@as(?bool, false), value.treat_as_character);
                    try std.testing.expectEqualDeep([4]?bool{ false, false, true, false }, position.flags);
                } else {
                    try std.testing.expectEqualDeep(Values{}, value);
                    try std.testing.expectEqualDeep(@import("picture_position_values.zig").Values{}, position);
                }
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize) !void {
                        _ = try readContainer(allocator, source, index);
                        _ = try @import("picture_position_values.zig").readContainer(allocator, source, index);
                    }
                }.run, .{ tree, node });
                count += 1;
            }
            try std.testing.expectEqual(@as(usize, 2), count);
            try std.testing.expectError(error.InvalidContainerGeometryNode, readContainer(a, tree, tree.elements.len));
            try std.testing.expectError(error.InvalidContainerGeometryNode, @import("picture_position_values.zig").readContainer(a, tree, 0));
        }
    }.run, .{});
}

test "HWPX table shared geometry preserves source size and placement" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    for (tree.elements, 0..) |_, node| {
        if (!fields.childIs(tree, node, "tbl")) continue;
        const expected = Values{ .width = 11337, .height = 14172, .width_relative = 4, .height_relative = 2, .treat_as_character = false, .horizontal_offset = 0, .vertical_offset = 0 };
        try std.testing.expectEqualDeep(expected, try readTable(a, tree, node));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize, value: Values) !void {
                try std.testing.expectEqualDeep(value, try readTable(allocator, source, index));
            }
        }.run, .{ tree, node, expected });
        try std.testing.expectError(error.InvalidTableGeometryNode, readTable(a, tree, tree.elements.len));
        return;
    }
    return error.MissingTable;
}

test "HWPX picture geometry values preserve absence zero namespace and numeric range" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture geometry values use actual display size rather than zero current size" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    for (section.tree.elements, 0..) |_, index| {
        if (!fields.childIs(&section.tree, index, "pic")) continue;
        const result = try read(a, &section.tree, index);
        try std.testing.expectEqual(@as(?u32, 12600), result.width);
        try std.testing.expectEqual(@as(?u32, 7560), result.height);
        try std.testing.expectEqual(@as(?bool, true), result.treat_as_character);
        return;
    }
    return error.MissingPictureImage;
}

test "HWPX picture geometry values reject duplicates and unknown relative bases" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic>";
    inline for (.{
        .{ "<p:sz/><p:sz/>", error.DuplicatePictureGeometryChild },
        .{ "<p:pos/><p:pos/>", error.DuplicatePictureGeometryChild },
        .{ "<p:sz widthRelTo='unknown'/>", error.UnsupportedPictureGeometryEnum },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], read(a, &tree, 1));
        try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &tree, tree.elements.len));
    }
    var missing = try @import("section_tree.zig").parse(a, prefix ++ "</p:pic></s:sec>", 0, 0, .{});
    defer missing.deinit(a);
    try std.testing.expectEqualDeep(Values{}, try read(a, &missing, 1));
}
