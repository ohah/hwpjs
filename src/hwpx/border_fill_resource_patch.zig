//! ID membership와 새 clone 삽입만 소유합니다. 원본 template의 참조는 변경하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
const helpers = @import("border_fill_xml_patch.zig");
pub const Result = struct { bytes: []u8, id: u32 };
pub fn id(a: std.mem.Allocator, tree: *const Tree, node: usize) !u32 {
    const raw = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingBorderFillId;
    return @import("table_xml_fields.zig").unsigned(a, raw, 4096);
}
pub fn target(a: std.mem.Allocator, tree: *const Tree, kind: []const u8, identity: u32) !usize {
    return @import("formatting_preflight.zig").node(a, tree, kind, identity);
}
pub fn reference(a: std.mem.Allocator, tree: *const Tree, node: usize) !u32 {
    const owner = if (tree.elements[node].is(head, "charPr")) node else if (tree.elements[node].is(head, "paraPr")) (try helpers.direct(tree, node, head, "border")) orelse return error.MissingParagraphBorder else return error.InvalidBorderFillOwner;
    const raw = (try tree.attributeValue(a, owner, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
    return @import("table_xml_fields.zig").unsigned(a, raw, 4096);
}
pub fn patchReference(a: std.mem.Allocator, tree: *const Tree, node: usize, identity: u32, limit: usize) ![]u8 {
    _ = try reference(a, tree, node);
    const owner = if (tree.elements[node].is(head, "charPr")) node else (try helpers.direct(tree, node, head, "border")) orelse return error.MissingParagraphBorder;
    const token = try std.fmt.allocPrint(a, "{d}", .{identity});
    defer a.free(token);
    return helpers.attribute(a, tree, owner, "borderFillIDRef", token, limit);
}
pub fn sourceNode(a: std.mem.Allocator, tree: *const Tree, identity: u32) !usize {
    var selected: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(head, "borderFill")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(head, "borderFills")) continue;
        const owner = tree.elements[parent].parent orelse continue;
        if (!tree.elements[owner].is(head, "refList")) continue;
        if (try id(a, tree, index) != identity) continue;
        if (selected != null) return error.DuplicateBorderFillId;
        selected = index;
    }
    return selected orelse error.MissingBorderFillId;
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, source_id: u32, patch: @import("../model/border_fill_patch.zig").Patch, limit: usize, profile: @import("source_color_profile.zig").Profile) !Result {
    const source_node = try sourceNode(a, tree, source_id);
    const parent = tree.elements[source_node].parent orelse return error.MissingBorderFills;
    var ids = std.AutoHashMap(u32, void).init(a);
    defer ids.deinit();
    var cursor = tree.elements[parent].first_child;
    var count: u32 = 0;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(head, "borderFill")) continue;
        const identity = try id(a, tree, index);
        const entry = try ids.getOrPut(identity);
        if (entry.found_existing) return error.DuplicateBorderFillId;
        count = std.math.add(u32, count, 1) catch return error.LimitExceeded;
    }
    const declared = (try tree.attributeValue(a, parent, "", "itemCnt")) orelse return error.MissingBorderFillCount;
    if (try @import("table_xml_fields.zig").unsigned(a, declared, 4096) != count) return error.BorderFillCountMismatch;
    var next_id: u32 = 0;
    while (ids.contains(next_id)) {
        next_id = std.math.add(u32, next_id, 1) catch return error.LimitExceeded;
    }
    const fragment = try helpers.write(a, tree, source_node, patch, limit, profile);
    defer a.free(fragment);
    const old_fragment = tree.sourceOf(source_node);
    const temp = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = tree.elements[source_node].start_tag.start, .end = tree.elements[source_node].end, .text = "", .serialized_xml = fragment }}, limit);
    defer a.free(temp);
    var parsed = try @import("header_tree.zig").parse(a, temp, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    const token = try std.fmt.allocPrint(a, "{d}", .{next_id});
    defer a.free(token);
    const identified = try helpers.attribute(a, &parsed, source_node, "id", token, limit);
    defer a.free(identified);
    var identified_tree = try @import("header_tree.zig").parse(a, identified, tree.item_index, .{ .max_xml_bytes = limit });
    defer identified_tree.deinit(a);
    const added = identified_tree.sourceOf(source_node);
    // 원 template이 있는 header에 새 resource만 삽입하므로 비대상 참조는 그대로입니다.
    const ending = tree.elements[parent].end_tag orelse return error.MissingBorderFillEndTag;
    const count_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ declared.raw[0], try std.math.add(u32, count, 1), declared.raw[0] });
    defer a.free(count_text);
    const start = @intFromPtr(declared.raw.ptr) - @intFromPtr(tree.source.ptr);
    _ = old_fragment;
    return .{ .bytes = try @import("xml_source_writer.zig").write(a, tree.source, &.{ .{ .start = start, .end = start + declared.raw.len, .text = "", .serialized_xml = count_text }, .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = added } }, limit), .id = next_id };
}
