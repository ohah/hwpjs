//! 본문 글자색 속성만 변경하고 다른 원문은 보존합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const rgb = @import("../model/rgb_color.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, color: u32, limit: usize) ![]u8 {
    try rgb.validate(color);
    _ = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    const attribute = try tree.attributeValue(a, node, "", "textColor");
    if (attribute) |raw| {
        const value = try raw.toUtf8(a, 4096);
        defer a.free(value);
        if (rgb.xml(value) == color) return a.dupe(u8, fragment);
    }
    const value = try rgb.format(a, color);
    defer a.free(value);
    return @import("character_attribute_patch.zig").write(a, tree, node, "textColor", value, limit);
}

test "HWPX text color patch preserves unrelated XML and all allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0' textColor = '#AaBbCc' shadeColor='none'><!--keep--><h:underline color='#ff0000'/></h:charPr><h:charPr id='1'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const same = try write(allocator, source, 1, 0xaabbcc, 4096);
            defer allocator.free(same);
            try std.testing.expectEqualStrings(source.sourceOf(1), same);
            const changed = try write(allocator, source, 1, 0x123456, 4096);
            defer allocator.free(changed);
            try std.testing.expectEqualStrings("<h:charPr id='0' textColor = '#123456' shadeColor='none'><!--keep--><h:underline color='#ff0000'/></h:charPr>", changed);
            const inserted = try write(allocator, source, 3, 0, 4096);
            defer allocator.free(inserted);
            try std.testing.expectEqualStrings("<h:charPr id='1' textColor=\"#000000\"/>", inserted);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.InvalidCharacterColor, write(a, &tree, 1, 0x1000000, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 0, 1));
    try std.testing.expectError(error.InvalidCharacterShapeElement, write(a, &tree, 0, 0, 4096));
}

test "HWPX text color patch preserves actual header outside the selected value" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "charPr")) continue;
        const raw = (try tree.attributeValue(a, node, "", "textColor")) orelse return error.MissingCharacterColor;
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
        for ([_]u32{ 0, 0xffffff, 0x123456 }) |color| {
            const fragment = try write(a, &tree, node, color, 4_000_000);
            defer a.free(fragment);
            const output = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = fragment }}, 4_000_000);
            defer a.free(output);
            const text = try rgb.format(a, color);
            defer a.free(text);
            const original_value = try raw.toUtf8(a, 4096);
            defer a.free(original_value);
            const expected = if (rgb.xml(original_value) == color) try a.dupe(u8, tree.source) else try std.fmt.allocPrint(a, "{s}{c}{s}{c}{s}", .{ tree.source[0..start], raw.raw[0], text, raw.raw[0], tree.source[start + raw.raw.len ..] });
            defer a.free(expected);
            try std.testing.expectEqualStrings(expected, output);
            var reopened = try @import("xml_part_tree.zig").parse(a, output, .header, null, tree.item_index, .{});
            defer reopened.deinit(a);
            const after = (try reopened.attributeValue(a, node, "", "textColor")).?;
            const decoded = try after.toUtf8(a, 4096);
            defer a.free(decoded);
            try std.testing.expectEqual(@as(?u32, color), rgb.xml(decoded));
        }
        count += 1;
    }
    try std.testing.expect(count > 0);
}
