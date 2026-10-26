//! 선 stroke의 원값입니다. 화살표·끝 모양·페이지 배치는 별도입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Values = struct { color: ?u32 = null, width: ?u32 = null, style: ?u32 = null };
pub const max_simple_style: u32 = 5;

pub fn read(a: std.mem.Allocator, tree: *const Tree, line: usize) !Values {
    if (line >= tree.elements.len or !fields.childIs(tree, line, "line")) return error.InvalidLineGeometryNode;
    return readComponent(a, tree, line, false);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize) !Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingTextNode;
    return readComponent(a, tree, rectangle, true);
}
pub fn readEllipse(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "ellipse")) return error.InvalidEllipseGeometryNode;
    return readComponent(a, tree, node, true);
}
pub fn readCurve(a: std.mem.Allocator, tree: *const Tree, node: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "curve")) return error.InvalidCurveGeometryNode;
    return readComponent(a, tree, node, true);
}

// Independent style intent survives an unsupported color; it is not an RGB fallback.
pub fn ellipseStyle(a: std.mem.Allocator, tree: *const Tree, node: usize) !?u32 {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "ellipse")) return error.InvalidEllipseGeometryNode;
    var source = try @import("line_shape_values.zig").collect(a, tree, node, 4096);
    defer source.deinit();
    return @import("line_style_values.zig").typeIndex(source.attributes.style orelse return null);
}

fn readComponent(a: std.mem.Allocator, tree: *const Tree, line: usize, allow_long_dash: bool) !Values {
    var source = try @import("line_shape_values.zig").collect(a, tree, line, 4096);
    defer source.deinit();
    if (source.node == null) return .{};
    const attr = source.attributes;
    // Do not silently paint unsupported decorations as a plain butt stroke.
    inline for (.{ .{ "endCap", "FLAT" }, .{ "headStyle", "NORMAL" }, .{ "tailStyle", "NORMAL" }, .{ "outlineStyle", "NORMAL" } }) |attribute| {
        if (@field(attr, attribute[0])) |value| {
            if (!std.mem.eql(u8, value, attribute[1])) return error.UnsupportedLineStrokeDecoration;
        }
    }
    if (attr.alpha) |raw| {
        const alpha = try @import("xml_values.zig").unsigned32(raw);
        if (alpha != 0) return error.UnsupportedLineStrokeDecoration;
    }
    var result: Values = .{};
    if (attr.width) |value| result.width = try @import("xml_values.zig").unsigned32(value);
    if (attr.color) |value| {
        if (!@import("xml_values.zig").sixHexColor(value)) return error.UnsupportedLineStrokeColor;
        result.color = try std.fmt.parseInt(u32, value[1..], 16);
    }
    if (attr.style) |value| {
        const style = @import("line_style_values.zig").typeIndex(value) orelse return error.UnsupportedLineStrokeStyle;
        if (style > (if (allow_long_dash) @as(u32, 6) else max_simple_style)) return error.UnsupportedLineStrokeStyle;
        result.style = style;
    }
    return result;
}

test "HWPX line stroke refuses decorations rather than silently flattening them" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:line><p:lineShape ";
    inline for (.{ "endCap='ROUND'", "endCap='SQUARE'", "headStyle='ARROW'", "tailStyle='ARROW'", "outlineStyle='UNKNOWN'", "alpha='1'" }) |attributes| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ attributes ++ "/></p:line></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
                const result = read(allocator, source, 1) catch |err| {
                    if (err == error.OutOfMemory) return err;
                    try std.testing.expectEqual(error.UnsupportedLineStrokeDecoration, err);
                    return;
                };
                _ = result;
                return error.TestUnexpectedResult;
            }
        }.run, .{&tree});
    }
}

test "HWPX line stroke admits simple patterns but keeps long dash rectangle-only" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:rect><p:lineShape style='DASH_DOT'/></p:rect><p:line><p:lineShape style='DASH_DOT'/></p:line></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?u32, 4), (try readRectangle(a, &tree, 1)).style);
    try std.testing.expectEqual(@as(?u32, 4), (try read(a, &tree, 3)).style);
    var long_dash = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:rect><p:lineShape style='LONG_DASH'/></p:rect><p:line><p:lineShape style='LONG_DASH'/></p:line></s:sec>", 0, 0, .{});
    defer long_dash.deinit(a);
    try std.testing.expectEqual(@as(?u32, 6), (try readRectangle(a, &long_dash, 1)).style);
    try std.testing.expectError(error.UnsupportedLineStrokeStyle, read(a, &long_dash, 3));
}

test "HWPX line stroke preserves zero absence namespace and allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:line><f:lineShape width='999'/><p:lineShape color='#00aAbB' width='0' style='NONE'/></p:line><p:line/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            try std.testing.expectEqualDeep(Values{ .color = 0x00aabb, .width = 0, .style = 0 }, try read(allocator, source, 1));
            try std.testing.expectEqualDeep(Values{}, try read(allocator, source, 4));
        }
    }.run, .{&tree});
}
