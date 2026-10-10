const std = @import("std");
const parse = @import("xml_part_tree.zig").parse;
const write = @import("character_underline_patch.zig").write;

test "HWPX underline patch preserves existing attributes extensions and all allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'><h:charPr id='0'><f:underline type='TOP'/><!--keep--><h:underline type = 'CENTER' shape='WAVE' color='#123456' opaque='keep'><f:child/></h:underline></h:charPr></h:head>";
    var tree = try parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            const output = try write(allocator, input, 1, .bottom, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:charPr id='0'><f:underline type='TOP'/><!--keep--><h:underline type = 'BOTTOM' shape='WAVE' color='#123456' opaque='keep'><f:child/></h:underline></h:charPr>", output);
            const unchanged = try write(allocator, input, 1, .center, 4096);
            defer allocator.free(unchanged);
            try std.testing.expectEqualStrings(input.sourceOf(1), unchanged);
            const disabled = try write(allocator, input, 1, .none, 4096);
            defer allocator.free(disabled);
            try std.testing.expect(std.mem.indexOf(u8, disabled, "type = 'NONE' shape='WAVE' color='#123456' opaque='keep'") != null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .bottom, 1));
}

test "HWPX underline patch inserts required defaults in schema order and expands empty owners" {
    const a = std.testing.allocator;
    const source = "<head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><charPr><bold/><!--keep--><strikeout shape='DASH' color='#123456'/></charPr><charPr id='1'/></head>";
    var tree = try parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            const output = try write(allocator, input, 1, .top, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<charPr><bold/><!--keep--><underline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"TOP\" shape=\"SOLID\" color=\"#000000\"/><strikeout shape='DASH' color='#123456'/></charPr>", output);
            const empty = try write(allocator, input, 4, .center, 4096);
            defer allocator.free(empty);
            try std.testing.expectEqualStrings("<charPr id='1'><underline xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" type=\"CENTER\" shape=\"SOLID\" color=\"#000000\"/></charPr>", empty);
            const unchanged = try write(allocator, input, 4, .none, 4096);
            defer allocator.free(unchanged);
            try std.testing.expectEqualStrings(input.sourceOf(4), unchanged);
        }
    }.run, .{&tree});
}

test "HWPX underline patch supplies missing type without changing shape color or paired body" {
    const a = std.testing.allocator;
    const source = "<head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><charPr><underline shape='DOT' color='#654321'><!--keep--></underline></charPr></head>";
    var tree = try parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const output = try write(a, &tree, 1, .top, 4096);
    defer a.free(output);
    try std.testing.expectEqualStrings("<charPr><underline shape='DOT' color='#654321' type=\"TOP\"><!--keep--></underline></charPr>", output);
}

test "HWPX underline patch actual header preserves existing shape color and reparses CENTER" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/underline-styles.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const values = @import("character_underline_values.zig");
    const uri = @import("document_xml.zig").head_uri;
    var existing: usize = 0;
    var absent: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "charPr")) continue;
        var before = try values.read(a, &tree, node, 4096);
        defer before.deinit(a);
        const output = try write(a, &tree, node, .center, 4_000_000);
        defer a.free(output);
        if (before.present) {
            existing += 1;
            var child = element.first_child;
            while (child) |index| : (child = tree.elements[index].next_sibling) {
                if (!tree.elements[index].is(uri, "underline")) continue;
                const attribute = (try tree.attributeValue(a, index, "", "type")).?;
                const fragment = tree.sourceOf(node);
                const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(fragment.ptr);
                const replacement = try std.fmt.allocPrint(a, "{c}CENTER{c}", .{ attribute.raw[0], attribute.raw[0] });
                defer a.free(replacement);
                const expected = try std.mem.concat(a, u8, &.{ fragment[0..start], replacement, fragment[start + attribute.raw.len ..] });
                defer a.free(expected);
                try std.testing.expectEqualSlices(u8, expected, output);
            }
        } else absent += 1;
        const whole = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = output }}, 4_000_000);
        defer a.free(whole);
        var parsed = try parse(a, whole, .header, null, 0, .{});
        defer parsed.deinit(a);
        var after = try values.read(a, &parsed, node, 4096);
        defer after.deinit(a);
        try std.testing.expectEqual(values.Kind.center, after.kind.?);
        try std.testing.expectEqualStrings(before.shape orelse "SOLID", after.shape.?);
        try std.testing.expectEqualStrings(before.color orelse "#000000", after.color.?);
    }
    try std.testing.expectEqual(@as(usize, 11), existing);
    try std.testing.expectEqual(@as(usize, 5), absent);
}
