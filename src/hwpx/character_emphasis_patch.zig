//! Namespace-aware optional emphasis elements, preserving unrelated XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
pub const Kind = enum { italic, bold, emboss, engrave, supscript, subscript };

test "HWPX effect flag patch preserves foreign elements and exact removal with allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr id='0'><f:emboss/><!--keep--><h:emboss/><h:subscript/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, .emboss, false, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:charPr id='0'><f:emboss/><!--keep--><h:subscript/></h:charPr>", output);
            const added = try write(allocator, source, 1, .supscript, true, 4096);
            defer allocator.free(added);
            try std.testing.expectEqualStrings("<h:charPr id='0'><f:emboss/><!--keep--><h:emboss/><supscript xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><h:subscript/></h:charPr>", added);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, kind: Kind, enabled: bool, limit: usize) ![]u8 {
    const shape = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    const present = switch (kind) {
        .bold => shape.bold,
        .italic => shape.italic,
        .emboss => shape.effects.emboss,
        .engrave => shape.effects.engrave,
        .supscript => shape.effects.superscript,
        .subscript => shape.effects.subscript,
    };
    if (present == enabled) return a.dupe(u8, fragment);
    const element = tree.elements[node];
    const base = element.start_tag.start;
    var selected: ?usize = null;
    var child = element.first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const candidate = tree.elements[index];
        if (candidate.is(uri, @tagName(kind))) selected = index;
    }
    if (!enabled) {
        const target = tree.elements[selected.?];
        return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = target.start_tag.start - base, .end = target.end - base, .text = "", .serialized_xml = "" }}, limit);
    }
    const flag = try std.fmt.allocPrint(a, "<{s} xmlns=\"{s}\"/>", .{ @tagName(kind), uri });
    defer a.free(flag);
    const following = [_][]const u8{ "bold", "underline", "strikeout", "outline", "shadow", "emboss", "engrave", "supscript", "subscript" };
    const start: usize = switch (kind) {
        .italic => 0,
        .bold => 1,
        .emboss => 6,
        .engrave => 7,
        .supscript => 8,
        .subscript => 9,
    };
    return @import("character_child_insert.zig").write(a, tree, node, flag, following[start..], limit);
}

test "HWPX character emphasis patch preserves namespaces order and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr id='9'><f:bold/><!--keep--><h:bold/><h:underline/></h:charPr><h:charPr id='10'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const enabled = try write(allocator, source, 1, .italic, true, 4096);
            defer allocator.free(enabled);
            try std.testing.expectEqualStrings("<h:charPr id='9'><f:bold/><!--keep--><italic xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><h:bold/><h:underline/></h:charPr>", enabled);
            const removed = try write(allocator, source, 1, .bold, false, 4096);
            defer allocator.free(removed);
            try std.testing.expectEqualStrings("<h:charPr id='9'><f:bold/><!--keep--><h:underline/></h:charPr>", removed);
            const expanded = try write(allocator, source, 5, .bold, true, 4096);
            defer allocator.free(expanded);
            try std.testing.expectEqualStrings("<h:charPr id='10'><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/></h:charPr>", expanded);
            const unchanged = try write(allocator, source, 1, .bold, true, 4096);
            defer allocator.free(unchanged);
            try std.testing.expectEqualSlices(u8, source.sourceOf(1), unchanged);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .italic, true, 1));
}

test "HWPX character emphasis patch handles default namespaces paired flags and semantic reparse" {
    const a = std.testing.allocator;
    const input = "<head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><charPr id='0'><italic></italic><!--keep--><underline/></charPr></head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    const removed = try write(a, &tree, 1, .italic, false, 4096);
    defer a.free(removed);
    try std.testing.expectEqualStrings("<charPr id='0'><!--keep--><underline/></charPr>", removed);
    const added = try write(a, &tree, 1, .bold, true, 4096);
    defer a.free(added);
    const whole = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = tree.elements[1].start_tag.start, .end = tree.elements[1].end, .text = "", .serialized_xml = added }}, 4096);
    defer a.free(whole);
    var reparsed = try @import("xml_part_tree.zig").parse(a, whole, .header, null, 0, .{});
    defer reparsed.deinit(a);
    const shape = try @import("character_shape_display.zig").read(a, &reparsed, 1, 4096);
    try std.testing.expect(shape.bold and shape.italic);
    try std.testing.expectEqualStrings("<charPr id='0'><italic></italic><!--keep--><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><underline/></charPr>", added);
}
