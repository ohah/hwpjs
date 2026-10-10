//! Explicit shade intent; preserve unrelated attributes and XML spelling.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const shade = @import("../model/shade_color.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, intent: shade.Intent, limit: usize) ![]u8 {
    const value = try shade.formatXml(a, intent);
    defer a.free(value);
    _ = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    const attribute = try tree.attributeValue(a, node, "", "shadeColor");
    if (attribute) |raw| {
        const decoded = try raw.toUtf8(a, 4096);
        defer a.free(decoded);
        if (std.meta.eql(shade.xml(decoded), shade.xml(value))) return a.dupe(u8, fragment);
    }
    return @import("character_attribute_patch.zig").write(a, tree, node, "shadeColor", value, limit);
}

test "HWPX shade patch distinguishes removal white and preserves unknown XML under allocation failure" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0' shadeColor = '#ffffffff' textColor='#123456'><!--keep--></h:charPr><h:charPr id='1'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const same = try write(allocator, source, 1, .none, 4096);
            defer allocator.free(same);
            try std.testing.expectEqualStrings(source.sourceOf(1), same);
            const white = try write(allocator, source, 1, .{ .color = 0xffffff }, 4096);
            defer allocator.free(white);
            try std.testing.expectEqualStrings("<h:charPr id='0' shadeColor = '#ffffff' textColor='#123456'><!--keep--></h:charPr>", white);
            const inserted = try write(allocator, source, 2, .none, 4096);
            defer allocator.free(inserted);
            try std.testing.expectEqualStrings("<h:charPr id='1' shadeColor=\"#FFFFFFFF\"/>", inserted);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .none, 1));
    try std.testing.expectError(error.InvalidCharacterShapeElement, write(a, &tree, 0, .none, 4096));
}

test "HWPX shade patch changes every actual charshape resource without changing input" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var package = try @import("package.zig").inspectDocument(a, input, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "charPr")) continue;
        const original = tree.sourceOf(node);
        const raw = (try tree.attributeValue(a, node, "", "shadeColor")) orelse return error.MissingShadeColor;
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(original.ptr);
        const output = try write(a, &tree, node, .{ .color = 0x123456 }, 4_000_000);
        defer a.free(output);
        const expected = try std.fmt.allocPrint(a, "{s}{c}#123456{c}{s}", .{ original[0..start], raw.raw[0], raw.raw[0], original[start + raw.raw.len ..] });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, output);
        const same = try write(a, &tree, node, .none, 4_000_000);
        defer a.free(same);
        try std.testing.expectEqualStrings(original, same);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 19), count);
}
