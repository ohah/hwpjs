//! Insert one cloned charPr; original templates and unrelated XML stay intact.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;
const fields = @import("table_xml_fields.zig");
pub fn write(a: std.mem.Allocator, tree: *const Tree, template: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize) ![]u8 {
    if (template >= tree.elements.len) return error.InvalidElementIndex;
    const parent = tree.elements[template].parent orelse return error.InvalidCharacterResourceParent;
    if (!tree.elements[parent].is(uri, "charProperties")) return error.InvalidCharacterResourceParent;
    const count_raw = (try tree.attributeValue(a, parent, "", "itemCnt")) orelse return error.MissingCharacterResourceCount;
    const count = try fields.unsigned(a, count_raw, 4096);
    var actual: usize = 0;
    var child = tree.elements[parent].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "charPr")) continue;
        const shape = try @import("character_shape_display.zig").read(a, tree, index, 4096);
        if (shape.id == null) return error.MissingCharacterShapeReference;
        if (shape.id.? == id) return error.DuplicateCharacterResourceId;
        actual += 1;
    }
    if (actual != count) return error.CharacterResourceCountMismatch;
    const next_count = std.math.add(u32, count, 1) catch return error.LimitExceeded;
    const ending = tree.elements[parent].end_tag orelse return error.MissingCharacterResourceEndTag;
    const fragment = try @import("character_resource_clone.zig").write(a, tree, template, id, properties, limit);
    defer a.free(fragment);
    const count_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ count_raw.raw[0], next_count, count_raw.raw[0] });
    defer a.free(count_text);
    const start = @intFromPtr(count_raw.raw.ptr) - @intFromPtr(tree.source.ptr);
    return @import("xml_source_writer.zig").write(a, tree.source, &.{
        .{ .start = start, .end = start + count_raw.raw.len, .text = "", .serialized_xml = count_text },
        .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = fragment },
    }, limit);
}

test "HWPX character resource insertion preserves complete header and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:charProperties itemCnt = '&#49;' opaque='keep'><h:charPr id='9' height='1000'><h:italic/></h:charPr><!--keep--></h:charProperties><h:styles/></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 3, 300, .{ .size = 2400, .italic = false, .bold = true }, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:charProperties itemCnt = '2' opaque='keep'><h:charPr id='9' height='1000'><h:italic/></h:charPr><!--keep--><h:charPr id='300' height='2400'><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/></h:charPr></h:charProperties><h:styles/></h:refList></h:head>", output);
            var parsed = try @import("xml_part_tree.zig").parse(allocator, output, .header, null, 0, .{});
            defer parsed.deinit(allocator);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.DuplicateCharacterResourceId, write(a, &tree, 3, 9, .{}, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 3, 300, .{}, 1));
    try std.testing.expectEqualStrings(input, tree.source);
}
