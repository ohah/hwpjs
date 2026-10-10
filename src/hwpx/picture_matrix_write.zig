//! Writes one existing rendering matrix tag; does not choose resize semantics.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("picture_matrix_fields.zig");
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, values: [6]f64, limit: usize) ![]u8 {
    if (fields.kind(tree, node) == null) return error.InvalidPictureMatrixNode;
    const parent = tree.elements[node].parent orelse return error.InvalidPictureMatrixParent;
    if (!@import("table_xml_fields.zig").childIs(tree, parent, "renderingInfo")) return error.InvalidPictureMatrixParent;
    return @import("xml_float_attributes_write.zig").write(a, tree, node, &fields.names, values, limit);
}

test "HWPX picture matrix writer preserves unknown attributes and every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic><p:renderingInfo><c:scaMatrix e6='0' opaque='keep' e1='&#49;.00' e2='0' e3='0' e4='0' e5='1'/></p:renderingInfo></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const result = try write(allocator, source, 3, .{ 1, 0, 0, 0, -2.5, 0 }, 1000);
            defer allocator.free(result);
            try std.testing.expectEqualStrings("<c:scaMatrix e6='0' opaque='keep' e1='&#49;.00' e2='0' e3='0' e4='0' e5='-2.5'/>", result);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidPictureMatrixNode, write(a, &tree, 1, @splat(0), 1000));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX picture matrix writer keeps all thirty nine actual matrix tags no-op exact" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "shapepict-scaled.hwpx", "sample-5017-pics.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(16_000_000));
        defer a.free(bytes);
        var package = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer package.deinit(a);
        var tree = try package.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |element, node| {
            if (fields.kind(&tree, node) == null) continue;
            var values: [6]f64 = undefined;
            for (fields.names, 0..) |field, index| {
                const raw = (try tree.attributeValue(a, node, "", field)).?;
                const text = try raw.toUtf8(a, 4096);
                defer a.free(text);
                values[index] = try @import("xml_values.zig").float64(text);
            }
            const result = try write(a, &tree, node, values, 4096);
            defer a.free(result);
            try std.testing.expectEqualStrings(tree.source[element.start_tag.start..element.start_tag.end], result);
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 39), count);
}

test "HWPX picture matrix writer rejects foreign namespaces wrong parents and incomplete coefficients" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>";
    inline for (.{
        .{ "<p:renderingInfo><x:scaMatrix/></p:renderingInfo>", @as(usize, 2), error.InvalidPictureMatrixNode },
        .{ "<c:scaMatrix/>", @as(usize, 1), error.InvalidPictureMatrixParent },
        .{ "<p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1'/></p:renderingInfo>", @as(usize, 2), error.MissingXmlNumericAttribute },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ "</s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[2], write(a, &tree, case[1], .{ 2, 0, 0, 0, 2, 0 }, 4096));
    }
}
