//! Clone one resource fragment; header insertion and unique ID allocation are separate.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
pub const Alignment = enum { LEFT, RIGHT, CENTER, JUSTIFY, DISTRIBUTE, DISTRIBUTE_SPACE };

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, new_id: u32, alignment: ?Alignment, max_bytes: usize) ![]u8 {
    _ = try @import("paragraph_display_shape.zig").read(a, tree, node);
    const id = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingParagraphShapeReference;
    const fragment = tree.sourceOf(node);
    const id_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ id.raw[0], new_id, id.raw[0] });
    defer a.free(id_text);
    const base = @intFromPtr(fragment.ptr);
    const id_start = @intFromPtr(id.raw.ptr) - base;
    if (alignment == null) return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = id_start, .end = id_start + id.raw.len, .text = "", .serialized_xml = id_text }}, max_bytes);
    var align_node: ?usize = null;
    var cursor = tree.elements[node].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (tree.elements[index].is(head, "align")) align_node = index;
    }
    const selected = align_node orelse return error.MissingParagraphAlignment;
    const horizontal = (try tree.attributeValue(a, selected, "", "horizontal")) orelse return error.MissingParagraphAlignment;
    const align_text = try std.fmt.allocPrint(a, "{c}{s}{c}", .{ horizontal.raw[0], @tagName(alignment.?), horizontal.raw[0] });
    defer a.free(align_text);
    const align_start = @intFromPtr(horizontal.raw.ptr) - base;
    return @import("xml_source_writer.zig").write(a, fragment, &.{
        .{ .start = id_start, .end = id_start + id.raw.len, .text = "", .serialized_xml = id_text },
        .{ .start = align_start, .end = align_start + horizontal.raw.len, .text = "", .serialized_xml = align_text },
    }, max_bytes);
}

test "HWPX paragraph resource clone changes only identity and alignment with all allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:opaque'><h:paraPr id = '&#57;' opaque='keep'><h:align vertical='BASELINE' horizontal='LEFT'/><x:future a='keep&amp;x'/><h:lineSpacing type='PERCENT' value='160' unit='HWPUNIT'/></h:paraPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const result = try write(allocator, source, 1, 300, .RIGHT, 4096);
            defer allocator.free(result);
            try std.testing.expectEqualStrings("<h:paraPr id = '300' opaque='keep'><h:align vertical='BASELINE' horizontal='RIGHT'/><x:future a='keep&amp;x'/><h:lineSpacing type='PERCENT' value='160' unit='HWPUNIT'/></h:paraPr>", result);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 300, .RIGHT, 1));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "paragraph resource identity clone preserves unknown encoded and absent alignment bytes" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<h:align horizontal='FUT&#85;RE' vertical='BASELINE'/>", "" }) |alignment_xml| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraPr id='9' opaque='keep'>{s}<h:breakSetting keepLines='1'/></h:paraPr></h:head>", .{alignment_xml});
        defer a.free(input);
        const expected = try std.fmt.allocPrint(a, "<h:paraPr id='300' opaque='keep'>{s}<h:breakSetting keepLines='1'/></h:paraPr>", .{alignment_xml});
        defer a.free(expected);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, result: []const u8) !void {
                const output = try write(allocator, source, 1, 300, null, 4096);
                defer allocator.free(output);
                try std.testing.expectEqualStrings(result, output);
            }
        }.run, .{ &tree, expected });
        try std.testing.expectEqualStrings(input, tree.source);
    }
}
