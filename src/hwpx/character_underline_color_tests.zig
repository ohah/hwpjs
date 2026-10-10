const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const patch = @import("character_underline_patch.zig");

test "HWPX underline color actual sixteen resources preserve source position and shape" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/underline-styles.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const original = try a.dupe(u8, tree.source);
    defer a.free(original);
    const values = @import("character_underline_values.zig");
    const uri = @import("document_xml.zig").head_uri;
    var existing: usize = 0;
    var absent: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "charPr")) continue;
        var before = try values.read(a, &tree, node, 4096);
        defer before.deinit(a);
        const output = try patch.writeColor(a, &tree, node, 0x123456, 4_000_000);
        defer a.free(output);
        if (before.present) {
            existing += 1;
            var child = element.first_child;
            while (child) |index| : (child = tree.elements[index].next_sibling) {
                if (!tree.elements[index].is(uri, "underline")) continue;
                const attribute = (try tree.attributeValue(a, index, "", "color")).?;
                const fragment = tree.sourceOf(node);
                const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(fragment.ptr);
                const replacement = try std.fmt.allocPrint(a, "{c}#123456{c}", .{ attribute.raw[0], attribute.raw[0] });
                defer a.free(replacement);
                const expected = try std.mem.concat(a, u8, &.{ fragment[0..start], replacement, fragment[start + attribute.raw.len ..] });
                defer a.free(expected);
                try std.testing.expectEqualSlices(u8, expected, output);
            }
        } else absent += 1;
        const whole = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = output }}, 4_000_000);
        defer a.free(whole);
        var parsed = try @import("xml_part_tree.zig").parse(a, whole, .header, null, 0, .{});
        defer parsed.deinit(a);
        var after = try values.read(a, &parsed, node, 4096);
        defer after.deinit(a);
        try std.testing.expectEqual(before.kind orelse .none, after.kind.?);
        try std.testing.expectEqualStrings(before.shape orelse "SOLID", after.shape.?);
        try std.testing.expectEqualStrings("#123456", after.color.?);
        try std.testing.expectEqualSlices(u8, original, tree.source);
    }
    try std.testing.expectEqual(@as(usize, 11), existing);
    try std.testing.expectEqual(@as(usize, 5), absent);
}

test "HWPX underline color patch preserves position shape extensions and all allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='9'><h:underline type='CENTER' shape='WAVE' color='&#35;AABBCC' opaque='keep'><!--keep--></h:underline></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const same = try patch.writeColor(a, &tree, 1, 0xaabbcc, 4096);
    defer a.free(same);
    try std.testing.expectEqualStrings(tree.sourceOf(1), same);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const output = try patch.writeColor(allocator, parsed, 1, 0x123456, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:charPr id='9'><h:underline type='CENTER' shape='WAVE' color='#123456' opaque='keep'><!--keep--></h:underline></h:charPr>", output);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.InvalidCharacterColor, patch.writeColor(a, &tree, 1, 0x1000000, 4096));
    try std.testing.expectError(error.LimitExceeded, patch.writeColor(a, &tree, 1, 0, 1));
}

test "HWPX underline color absent and missing attributes do not enable a line" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr/><h:charPr><h:underline type='TOP' shape='DOT'/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const created = try patch.writeColor(a, &tree, 1, 0, 4096);
    defer a.free(created);
    try std.testing.expectEqualStrings("<h:charPr><underline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"NONE\" shape=\"SOLID\" color=\"#000000\"/></h:charPr>", created);
    const completed = try patch.writeColor(a, &tree, 2, 0x123456, 4096);
    defer a.free(completed);
    try std.testing.expectEqualStrings("<h:charPr><h:underline type='TOP' shape='DOT' color=\"#123456\"/></h:charPr>", completed);
}

test "HWPX underline color creation and attribute insertion survive all allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr/><h:charPr><h:underline type='TOP' shape='DOT'/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const verify = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, node: usize, expected: []const u8) !void {
            const output = try patch.writeColor(allocator, parsed, node, 0x123456, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(expected, output);
        }
    }.run;
    try std.testing.checkAllAllocationFailures(a, verify, .{ &tree, @as(usize, 1), "<h:charPr><underline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"NONE\" shape=\"SOLID\" color=\"#123456\"/></h:charPr>" });
    try std.testing.checkAllAllocationFailures(a, verify, .{ &tree, @as(usize, 2), "<h:charPr><h:underline type='TOP' shape='DOT' color=\"#123456\"/></h:charPr>" });
    try std.testing.expectEqualStrings(source, tree.source);
}
