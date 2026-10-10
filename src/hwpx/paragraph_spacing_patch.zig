//! Source-bound line-spacing edits preserve unrelated paragraph XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
pub const Spacing = @import("../model/document.zig").ParagraphSpacing;
pub const names = [_][]const u8{ "PERCENT", "FIXED", "BETWEEN_LINES", "AT_LEAST" };
pub fn validate(spacing: Spacing) !void {
    if (spacing.kind >= names.len) return error.InvalidParagraphSpacing;
    if (spacing.kind == 0 and (spacing.value < 0 or spacing.value > 500)) return error.InvalidParagraphSpacing;
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, spacing: Spacing, limit: usize) ![]u8 {
    try validate(spacing);
    _ = try @import("paragraph_display_shape.zig").read(a, tree, node);
    var selected: ?usize = null;
    var cursor = tree.elements[node].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (tree.elements[index].is(@import("document_xml.zig").head_uri, "lineSpacing")) selected = index;
    }
    const index = selected orelse return error.MissingParagraphSpacing;
    if (spacing.kind != 0) {
        if (try tree.attributeValue(a, index, "", "unit")) |unit| {
            const value = try unit.toUtf8(a, 4096);
            defer a.free(value);
            if (!std.mem.eql(u8, value, "HWPUNIT")) return error.UnsupportedParagraphSpacingUnit;
        }
    }
    const kind = (try tree.attributeValue(a, index, "", "type")) orelse return error.MissingParagraphSpacing;
    const value = (try tree.attributeValue(a, index, "", "value")) orelse return error.MissingParagraphSpacing;
    const kind_text = try std.fmt.allocPrint(a, "{c}{s}{c}", .{ kind.raw[0], names[spacing.kind], kind.raw[0] });
    defer a.free(kind_text);
    const value_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ value.raw[0], spacing.value, value.raw[0] });
    defer a.free(value_text);
    const fragment = tree.sourceOf(node);
    const base = @intFromPtr(fragment.ptr);
    var changes = [_]writer.Change{
        .{ .start = @intFromPtr(kind.raw.ptr) - base, .end = @intFromPtr(kind.raw.ptr) - base + kind.raw.len, .text = "", .serialized_xml = kind_text },
        .{ .start = @intFromPtr(value.raw.ptr) - base, .end = @intFromPtr(value.raw.ptr) - base + value.raw.len, .text = "", .serialized_xml = value_text },
    };
    if (changes[0].start > changes[1].start) std.mem.swap(writer.Change, &changes[0], &changes[1]);
    return writer.write(a, fragment, &changes, limit);
}
test "HWPX paragraph spacing patch preserves default unit opaque XML and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraPr id='9' opaque='keep'><h:lineSpacing value='160' type='PERCENT'/><!--keep--></h:paraPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, .{ .kind = 3, .value = 720 }, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:paraPr id='9' opaque='keep'><h:lineSpacing value='720' type='AT_LEAST'/><!--keep--></h:paraPr>", output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidParagraphSpacing, write(a, &tree, 1, .{ .kind = 0, .value = 501 }, 4096));
    try std.testing.expectError(error.InvalidParagraphSpacing, write(a, &tree, 1, .{ .kind = 0, .value = -1 }, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX paragraph spacing patch distinguishes character unit from schema default and percentage" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "", " unit='HWPUNIT'", " unit='CHAR'", " unit='future'" }) |unit| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraPr id='9'><h:lineSpacing type='PERCENT' value='160'{s}/></h:paraPr></h:head>", .{unit});
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        for ([_]i32{ 0, 500 }) |value| {
            const output = try write(a, &tree, 1, .{ .kind = 0, .value = value }, 4096);
            defer a.free(output);
            if (unit.len != 0) try std.testing.expect(std.mem.indexOf(u8, output, unit) != null);
        }
        if (std.mem.eql(u8, unit, " unit='CHAR'") or std.mem.eql(u8, unit, " unit='future'")) {
            try std.testing.expectError(error.UnsupportedParagraphSpacingUnit, write(a, &tree, 1, .{ .kind = 1, .value = 720 }, 4096));
        } else {
            const output = try write(a, &tree, 1, .{ .kind = 1, .value = 720 }, 4096);
            defer a.free(output);
            if (unit.len == 0) try std.testing.expect(std.mem.indexOf(u8, output, " unit=") == null);
        }
        try std.testing.expectEqualStrings(input, tree.source);
    }
}
