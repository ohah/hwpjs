//! Replace existing HWPUNIT margin values without rewriting unrelated XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
pub const Patch = @import("../model/document.zig").ParagraphMarginPatch;

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: Patch, limit: usize) ![]u8 {
    const display = @import("paragraph_display_shape.zig");
    _ = try display.read(a, tree, node);
    const fragment = tree.sourceOf(node);
    const values = [_]?i32{ patch.indent, patch.left, patch.right, patch.before, patch.after };
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var replacements: std.ArrayList([]u8) = .empty;
    defer {
        for (replacements.items) |bytes| a.free(bytes);
        replacements.deinit(a);
    }
    var margin: ?usize = null;
    var cursor = tree.elements[node].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (tree.elements[index].is(@import("document_xml.zig").head_uri, "margin")) margin = index;
    }
    for (values, 0..) |maybe, field| {
        const value = maybe orelse continue;
        const parent = margin orelse return error.MissingParagraphMargin;
        var selected: ?usize = null;
        cursor = tree.elements[parent].first_child;
        while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
            if (tree.elements[index].is("http://www.hancom.co.kr/hwpml/2011/core", display.margin_names[field])) selected = index;
        }
        const index = selected orelse return error.MissingParagraphMargin;
        if (try tree.attributeValue(a, index, "", "unit")) |unit| {
            const decoded = try unit.toUtf8(a, 4096);
            defer a.free(decoded);
            if (!std.mem.eql(u8, decoded, "HWPUNIT")) return error.UnsupportedParagraphMarginUnit;
        }
        const raw = (try tree.attributeValue(a, index, "", "value")) orelse return error.MissingParagraphMarginValue;
        const replacement = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw.raw[0], value, raw.raw[0] });
        replacements.append(a, replacement) catch |err| {
            a.free(replacement);
            return err;
        };
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(fragment.ptr);
        try changes.append(a, .{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = replacement });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, fragment, changes.items, limit);
}

test "HWPX paragraph margin patch preserves opaque XML and survives allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:paraPr id='9'><h:margin opaque='keep'><c:prev unit='HWPUNIT' value='100'/><!--keep--><c:intent value='-2000' unit='HWPUNIT'/><c:left value='720' unit='HWPUNIT'/></h:margin></h:paraPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const output = try write(allocator, input, 1, .{ .indent = -720, .before = 0 }, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:paraPr id='9'><h:margin opaque='keep'><c:prev unit='HWPUNIT' value='0'/><!--keep--><c:intent value='-720' unit='HWPUNIT'/><c:left value='720' unit='HWPUNIT'/></h:margin></h:paraPr>", output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.MissingParagraphMargin, write(a, &tree, 1, .{ .right = 0 }, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .{}, 1));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX paragraph margin patch applies schema default unit and refuses unknown units" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "", " unit='future'" }) |unit| {
        const source = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:paraPr id='9'><h:margin><c:intent value='0'{s}/></h:margin></h:paraPr></h:head>", .{unit});
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        if (unit.len == 0) {
            const changed = try write(a, &tree, 1, .{ .indent = -720 }, 4096);
            defer a.free(changed);
            try std.testing.expect(std.mem.indexOf(u8, changed, "value='-720'") != null);
            try std.testing.expect(std.mem.indexOf(u8, changed, " unit=") == null);
        } else try std.testing.expectError(error.UnsupportedParagraphMarginUnit, write(a, &tree, 1, .{ .indent = 0 }, 4096));
        const unchanged = try write(a, &tree, 1, .{}, 4096);
        defer a.free(unchanged);
        try std.testing.expectEqualStrings(tree.sourceOf(1), unchanged);
    }
}
