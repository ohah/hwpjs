//! Header serialization only; session resource state and history are separate.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const clone = @import("paragraph_resource_clone.zig");
const fields = @import("table_xml_fields.zig");
const head = @import("document_xml.zig").head_uri;

pub fn writeWithMargins(a: std.mem.Allocator, tree: *const Tree, template: usize, new_id: u32, alignment: ?clone.Alignment, margins: @import("paragraph_margin_patch.zig").Patch, max_bytes: usize) ![]u8 {
    return writeWithProperties(a, tree, template, new_id, alignment, margins, null, max_bytes);
}
pub fn writeWithProperties(a: std.mem.Allocator, tree: *const Tree, template: usize, new_id: u32, alignment: ?clone.Alignment, margins: @import("paragraph_margin_patch.zig").Patch, spacing: ?@import("paragraph_spacing_patch.zig").Spacing, max_bytes: usize) ![]u8 {
    if (spacing == null and std.meta.eql(margins, @as(@import("paragraph_margin_patch.zig").Patch, .{}))) return write(a, tree, template, new_id, alignment, max_bytes);
    const fragment = try @import("paragraph_resource_patch.zig").write(a, tree, template, margins, spacing, max_bytes);
    defer a.free(fragment);
    const original = tree.sourceOf(template);
    const start = @intFromPtr(original.ptr) - @intFromPtr(tree.source.ptr);
    const modified = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = start, .end = start + original.len, .text = "", .serialized_xml = fragment }}, max_bytes);
    defer a.free(modified);
    var parsed = try @import("header_tree.zig").parse(a, modified, tree.item_index, .{ .max_xml_bytes = max_bytes });
    defer parsed.deinit(a);
    const inserted = try write(a, &parsed, template, new_id, alignment, max_bytes);
    defer a.free(inserted);
    // Keep the original template unchanged; only the appended clone has margins.
    var result_tree = try @import("header_tree.zig").parse(a, inserted, tree.item_index, .{ .max_xml_bytes = max_bytes });
    defer result_tree.deinit(a);
    const patched = result_tree.sourceOf(template);
    const restore_start = @intFromPtr(patched.ptr) - @intFromPtr(result_tree.source.ptr);
    return @import("xml_source_writer.zig").write(a, result_tree.source, &.{.{ .start = restore_start, .end = restore_start + patched.len, .text = "", .serialized_xml = original }}, max_bytes);
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, template: usize, new_id: u32, alignment: ?clone.Alignment, max_bytes: usize) ![]u8 {
    if (template >= tree.elements.len) return error.InvalidElementIndex;
    const parent = tree.elements[template].parent orelse return error.InvalidParagraphResourceParent;
    if (!tree.elements[parent].is(head, "paraProperties")) return error.InvalidParagraphResourceParent;
    const count_raw = (try tree.attributeValue(a, parent, "", "itemCnt")) orelse return error.MissingParagraphResourceCount;
    const count = try fields.unsigned(a, count_raw, 4096);
    var actual: usize = 0;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(head, "paraPr")) continue;
        const id_raw = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingParagraphShapeReference;
        if (try fields.unsigned(a, id_raw, 4096) == new_id) return error.DuplicateParagraphResourceId;
        actual += 1;
    }
    if (actual != count) return error.ParagraphResourceCountMismatch;
    const next_count = std.math.add(u32, count, 1) catch return error.LimitExceeded;
    const ending = tree.elements[parent].end_tag orelse return error.MissingParagraphResourceEndTag;
    const fragment = try clone.write(a, tree, template, new_id, alignment, max_bytes);
    defer a.free(fragment);
    const count_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ count_raw.raw[0], next_count, count_raw.raw[0] });
    defer a.free(count_text);
    const start = @intFromPtr(count_raw.raw.ptr) - @intFromPtr(tree.source.ptr);
    return @import("xml_source_writer.zig").write(a, tree.source, &.{
        .{ .start = start, .end = start + count_raw.raw.len, .text = "", .serialized_xml = count_text },
        .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = fragment },
    }, max_bytes);
}

test "HWPX paragraph resource insertion preserves header XML and all allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:paraProperties itemCnt = '&#49;' opaque='keep'><h:paraPr id='9'><h:align horizontal='LEFT' vertical='BASELINE'/></h:paraPr><!--keep--></h:paraProperties><h:styles/></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 3, 300, .CENTER, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:paraProperties itemCnt = '2' opaque='keep'><h:paraPr id='9'><h:align horizontal='LEFT' vertical='BASELINE'/></h:paraPr><!--keep--><h:paraPr id='300'><h:align horizontal='CENTER' vertical='BASELINE'/></h:paraPr></h:paraProperties><h:styles/></h:refList></h:head>", output);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, output, .header, null, 0, .{});
            defer reopened.deinit(allocator);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.DuplicateParagraphResourceId, write(a, &tree, 3, 9, .RIGHT, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 3, 300, .RIGHT, 1));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX margin resource insertion survives every allocation failure without changing its template" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:paraProperties itemCnt='1'><h:paraPr id='9'><h:align horizontal='RIGHT'/><h:margin><c:intent value='-2000'/><c:prev value='100' unit='HWPUNIT'/></h:margin><h:lineSpacing type='PERCENT' value='160'/></h:paraPr></h:paraProperties></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try writeWithProperties(allocator, source, 3, 300, .CENTER, .{ .indent = -720, .before = 0 }, .{ .kind = 3, .value = 720 }, 4096);
            defer allocator.free(output);
            var parsed = try @import("header_tree.zig").parse(allocator, output, 0, .{});
            defer parsed.deinit(allocator);
            try std.testing.expectEqualStrings(source.sourceOf(3), parsed.sourceOf(3));
            var found = false;
            for (parsed.elements, 0..) |element, index| {
                if (!element.is(head, "paraPr")) continue;
                const shape = try @import("paragraph_display_shape.zig").read(allocator, &parsed, index);
                if (shape.id != 300) continue;
                found = true;
                try std.testing.expectEqual(@as(?i64, -720), shape.margins[0].?.value);
                try std.testing.expect(shape.margins[0].?.unit == null);
                try std.testing.expectEqual(@as(?i64, 0), shape.margins[3].?.value);
                try std.testing.expectEqual(@as(?i64, 720), shape.spacing.?.value);
                try std.testing.expect(shape.spacing.?.unit == null);
            }
            try std.testing.expect(found);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX paragraph resource insertion reparses actual header with fresh sparse ID" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const ids = resources.table(.para_shape).ids.items;
    const id = try @import("resource_id_allocate.zig").next(ids);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var template: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(head, "paraPr")) {
            template = index;
            break;
        }
    }
    const output = try writeWithProperties(a, &tree, template.?, id, .RIGHT, .{ .indent = -720, .before = 0 }, .{ .kind = 0, .value = 200 }, 4_000_000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .header, null, 0, .{});
    defer reopened.deinit(a);
    var found: usize = 0;
    var count: usize = 0;
    for (reopened.elements, 0..) |element, index| {
        if (!element.is(head, "paraPr")) continue;
        count += 1;
        const shape = try @import("paragraph_display_shape.zig").read(a, &reopened, index);
        if (shape.id != id) continue;
        found += 1;
        const alignment = try shape.horizontal.?.toUtf8(a, 4096);
        defer a.free(alignment);
        try std.testing.expectEqualStrings("RIGHT", alignment);
        try std.testing.expectEqual(@as(?i64, -720), shape.margins[0].?.value);
        try std.testing.expectEqual(@as(?i64, 0), shape.margins[3].?.value);
        try std.testing.expectEqual(@as(?i64, 200), shape.spacing.?.value);
        const kind = try shape.spacing_type.?.toUtf8(a, 4096);
        defer a.free(kind);
        try std.testing.expectEqualStrings("PERCENT", kind);
    }
    try std.testing.expectEqual(@as(usize, 1), found);
    try std.testing.expectEqual(ids.len + 1, count);
    try std.testing.expectEqualStrings(tree.sourceOf(template.?), reopened.sourceOf(template.?));
}
