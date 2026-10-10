//! Finite float attribute policy over the shared lexical-preserving writer.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: f64) !bool {
    const bytes = try raw.toUtf8(a, 4096);
    defer a.free(bytes);
    const original = try @import("xml_values.zig").float64(bytes);
    if (!std.math.isFinite(original)) return error.NonFiniteXmlFloatAttribute;
    return original == value;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: f64) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, values: [names.len]f64, limit: usize) ![]u8 {
    for (values) |value| if (!std.math.isFinite(value)) return error.NonFiniteXmlFloatAttribute;
    return @import("xml_numeric_attributes_write.zig").write(a, tree, node, names, f64, values, equal, serialize, limit);
}

test "HWPX float attribute writer preserves unrelated lexical values and cleans every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:matrix e2='0' opaque='keep' e1 = \"&#49;.00\"/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const result = try write(allocator, source, 1, &.{ "e1", "e2" }, .{ 1, -1.5 }, 1000);
            defer allocator.free(result);
            try std.testing.expectEqualStrings("<p:matrix e2='-1.5' opaque='keep' e1 = \"&#49;.00\"/>", result);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.NonFiniteXmlFloatAttribute, write(a, &tree, 1, &.{"e1"}, .{std.math.nan(f64)}, 1000));
    try std.testing.expectError(error.MissingXmlNumericAttribute, write(a, &tree, 1, &.{"e3"}, .{0}, 1000));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX float attribute writer roundtrips extreme finite values without decimal precision loss" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:matrix e1='1'/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    for ([_]f64{ 5e-324, 1.7976931348623157e308, 0.1, -0.1, 1e-100 }) |value| {
        const tag = try write(a, &tree, 1, &.{"e1"}, .{value}, 4096);
        defer a.free(tag);
        const xml = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, tag });
        defer a.free(xml);
        var reopened = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
        defer reopened.deinit(a);
        const raw = (try reopened.attributeValue(a, 1, "", "e1")).?;
        const bytes = try raw.toUtf8(a, 4096);
        defer a.free(bytes);
        const parsed = try @import("xml_values.zig").float64(bytes);
        try std.testing.expectEqual(@as(u64, @bitCast(value)), @as(u64, @bitCast(parsed)));
    }
}
