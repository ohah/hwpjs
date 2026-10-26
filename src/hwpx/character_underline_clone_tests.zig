const std = @import("std");
const clone = @import("character_resource_clone.zig").writeUnderline;
const parse = @import("xml_part_tree.zig").parse;

test "HWPX underline clone preserves namespace identity attributes and allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'><h:charPr id='&#57;' height='1379' opaque='keep'><h:bold/><f:underline type='TOP'/><!--keep--><h:underline type='BOTTOM' shape='WAVE' color='#123456'/></h:charPr><h:charPr id='10'/></h:head>";
    var tree = try parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            const output = try clone(allocator, input, 1, 300, .center, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:charPr id='300' height='1379' opaque='keep'><h:bold/><f:underline type='TOP'/><!--keep--><h:underline type='CENTER' shape='WAVE' color='#123456'/></h:charPr>", output);
            const empty = try clone(allocator, input, 5, 0xffffffff, .none, 4096);
            defer allocator.free(empty);
            try std.testing.expectEqualStrings("<h:charPr id='4294967295'/>", empty);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, clone(a, &tree, 1, 300, .center, 1));
}

test "HWPX underline clone actual resources reparse without changing original header" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/underline-styles.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const values = @import("character_underline_values.zig");
    const shape_read = @import("character_shape_display.zig").read;
    const uri = @import("document_xml.zig").head_uri;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "charPr")) continue;
        count += 1;
        const before_shape = try shape_read(a, &tree, node, 4096);
        var before = try values.read(a, &tree, node, 4096);
        defer before.deinit(a);
        const output = try clone(a, &tree, node, 999, .center, 4_000_000);
        defer a.free(output);
        const whole = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = output }}, 4_000_000);
        defer a.free(whole);
        var parsed = try parse(a, whole, .header, null, 0, .{});
        defer parsed.deinit(a);
        var expected_shape = before_shape;
        expected_shape.id = 999;
        try std.testing.expectEqualDeep(expected_shape, try shape_read(a, &parsed, node, 4096));
        var after = try values.read(a, &parsed, node, 4096);
        defer after.deinit(a);
        try std.testing.expectEqual(values.Kind.center, after.kind.?);
        try std.testing.expectEqualStrings(before.shape orelse "SOLID", after.shape.?);
        try std.testing.expectEqualStrings(before.color orelse "#000000", after.color.?);
        try std.testing.expectEqualDeep(before_shape, try shape_read(a, &tree, node, 4096));
    }
    try std.testing.expectEqual(@as(usize, 16), count);
    var saved_tree = try package.readHeaderTree(a, .{});
    defer saved_tree.deinit(a);
    try std.testing.expectEqualSlices(u8, saved_tree.source, tree.source);
}
