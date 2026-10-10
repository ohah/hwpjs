const std = @import("std");
const trees = @import("xml_part_tree.zig");
const subject = @import("form_source_layout.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:checkBtn>";
const suffix = "</p:checkBtn></p:run></p:p></s:sec>";
fn case(a: std.mem.Allocator) !void {
    const xml = prefix ++ "<x:sz width='999'/><p:sz width='&#48;' widthRelTo='ABSOLUTE' protect='0'/><p:pos treatAsChar='0' horzOffset='-1'/><p:formCharPr charPrIDRef='0' followContext='0'/>" ++ suffix;
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const value = try subject.read(a, &tree, 3);
    try std.testing.expectEqual(@as(?u32, 0), value.geometry.width);
    try std.testing.expect(value.geometry.height == null);
    try std.testing.expectEqual(@as(?u32, 4), value.geometry.width_relative);
    try std.testing.expectEqual(@as(?bool, false), value.geometry.treat_as_character);
    try std.testing.expectEqual(@as(?i64, -1), value.geometry.horizontal_offset);
    try std.testing.expectEqual(@as(?bool, false), value.sizeProtected);
    try std.testing.expectEqual(@as(?u32, 0), value.character.id);
    try std.testing.expect(value.character.auto_size == null);
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "HWPX form layout preserves absent zero false namespace and ownership under OOM" {
    try @import("../testing/allocation_failures.zig").check(case, .{});
}
test "HWPX form layout reads actual dimensions font reference and placement for five forms" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const nodes = try @import("form_source_nodes.zig").read(a, &tree, 5);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 5), nodes.len);
    for (nodes, [_]u32{ 7087, 9921, 6058, 8504, 7087 }, [_]u32{ 1984, 1984, 1450, 1984, 1984 }, 0..) |node, width, height, index| {
        const value = try subject.read(a, &tree, node.formNode);
        try std.testing.expectEqual(@as(?u32, width), value.geometry.width);
        try std.testing.expectEqual(@as(?u32, height), value.geometry.height);
        try std.testing.expectEqual(@as(?u32, 4), value.geometry.width_relative);
        try std.testing.expectEqual(@as(?u32, 2), value.geometry.height_relative);
        try std.testing.expectEqual(@as(?bool, true), value.geometry.treat_as_character);
        try std.testing.expectEqualDeep([4]?bool{ false, true, true, false }, value.position.flags);
        try std.testing.expectEqual(@as(?u32, 0), value.character.id);
        try std.testing.expectEqual(@as(?bool, index == 2), value.character.auto_size);
    }
}
test "HWPX form layout refuses duplicate child invalid Boolean overflow and wrong node" {
    const a = std.testing.allocator;
    inline for (.{ .{ "<p:formCharPr/><p:formCharPr/>", error.DuplicateFormLayoutChild }, .{ "<p:sz/><p:sz/>", error.DuplicatePictureGeometryChild }, .{ "<p:formCharPr followContext='TRUE'/>", error.InvalidXmlBoolean }, .{ "<p:sz width='4294967296'/>", error.InvalidUnsigned32 } }) |entry| {
        var tree = try trees.parse(a, prefix ++ entry[0] ++ suffix, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(entry[1], subject.read(a, &tree, 3));
        try std.testing.expectError(error.InvalidFormNode, subject.read(a, &tree, 2));
        try std.testing.expectError(error.InvalidFormNode, subject.read(a, &tree, tree.elements.len));
    }
}
