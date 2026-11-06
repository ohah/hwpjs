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

/// Cell-only batch. Q is total materialized distinct clone bytes; work is O(N+M+Q).
/// The original header is indexed once and serialized once. Full-header write()
/// above is deliberately not called in the per-request loop.
pub const SolidRequest = struct { source_id: u32, color: u32 };
pub const SolidBatch = struct { bytes: []u8, ids: []u32 };
pub const SolidBatchStats = struct { resources: usize = 0, fragments: usize = 0, reused: usize = 0, header_writes: usize = 0 };

// Only namespace declarations from the three resource ancestors are needed by a
// local clone. Bound context to a fixed4KiB; no large root tag is reparsed per clone.
fn solidContext(a: std.mem.Allocator, tree: *const Tree, container: usize) ![]u8 {
    var declarations: std.StringHashMap([]const u8) = .init(a);
    defer declarations.deinit();
    const ref_list = tree.elements[container].parent orelse return error.MissingBorderFills;
    for ([_]usize{ 0, ref_list, container }) |node| {
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, node);
        defer tag.deinit(a);
        for (tag.attributes) |attr| {
            if (!try @import("../xml/root.zig").namespaces.isDeclaration(attr.name)) continue;
            if (std.mem.eql(u8, attr.name.raw, "xmlns:cellbgctx")) return error.UnsupportedCellBackgroundNamespaceContext;
            try declarations.put(attr.name.raw, attr.value.raw);
            if (declarations.count() > 64) return error.UnsupportedCellBackgroundNamespaceContext;
        }
    }
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    var cursor = declarations.iterator();
    while (cursor.next()) |entry| {
        const required = std.math.add(usize, output.items.len, entry.key_ptr.*.len + entry.value_ptr.*.len + 2) catch return error.LimitExceeded;
        if (required > 4096) return error.UnsupportedCellBackgroundNamespaceContext;
        try output.append(a, ' ');
        try output.appendSlice(a, entry.key_ptr.*);
        try output.append(a, '=');
        try output.appendSlice(a, entry.value_ptr.*);
    }
    return output.toOwnedSlice(a);
}

fn solidFragment(a: std.mem.Allocator, source: *const Tree, node: usize, identity: u32, color: u32, context: []const u8, limit: usize, profile: @import("source_color_profile.zig").Profile) ![]u8 {
    const prefix = try std.fmt.allocPrint(a, "<cellbgctx:head xmlns:cellbgctx=\"{s}\"{s}>", .{ head, context });
    defer a.free(prefix);
    const wrapped = try std.fmt.allocPrint(a, "{s}{s}</cellbgctx:head>", .{ prefix, source.sourceOf(node) });
    defer a.free(wrapped);
    var local = try @import("header_tree.zig").parse(a, wrapped, 0, .{ .max_xml_bytes = limit });
    defer local.deinit(a);
    const observed = try helpers.observeSelected(a, &local, 1, profile, @splat(false), true);
    const background = observed.background orelse return error.UnsupportedCellBackgroundContents;
    if (background != .none and background != .solid) return error.UnsupportedCellBackgroundContents;
    const changed = try helpers.write(a, &local, 1, .{ .background = .{ .solid = .{ .color = color } } }, limit, profile);
    defer a.free(changed);
    const rewrapped = try std.fmt.allocPrint(a, "{s}{s}</cellbgctx:head>", .{ prefix, changed });
    defer a.free(rewrapped);
    var parsed = try @import("header_tree.zig").parse(a, rewrapped, 0, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    const token = try std.fmt.allocPrint(a, "{d}", .{identity});
    defer a.free(token);
    const identified = try helpers.attribute(a, &parsed, 1, "id", token, limit);
    defer a.free(identified);
    var final = try @import("header_tree.zig").parse(a, identified, 0, .{ .max_xml_bytes = limit });
    defer final.deinit(a);
    return a.dupe(u8, final.sourceOf(1));
}

pub fn writeSolidBatch(a: std.mem.Allocator, tree: *const Tree, requests: []const SolidRequest, limit: usize, profile: @import("source_color_profile.zig").Profile, stats: *SolidBatchStats) !SolidBatch {
    if (!profile.verified) return error.UnsupportedCellBackgroundProfile;
    if (tree.source.len > limit or requests.len > 100000) return error.LimitExceeded;
    if (tree.elements.len == 0 or !tree.elements[0].is(head, "head")) return error.InvalidBorderFillHeader;
    var container: ?usize = null;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(head, "borderFills")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(head, "refList") or tree.elements[parent].parent != 0) continue;
        if (container != null) return error.DuplicateBorderFills;
        container = node;
    }
    const parent = container orelse return error.MissingBorderFills;
    var templates = std.AutoHashMap(u32, usize).init(a);
    defer templates.deinit();
    var occupied = std.AutoHashMap(u32, void).init(a);
    defer occupied.deinit();
    var child = tree.elements[parent].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(head, "borderFill")) continue;
        const identity = try id(a, tree, node);
        const entry = try templates.getOrPut(identity);
        if (entry.found_existing) return error.DuplicateBorderFillId;
        entry.value_ptr.* = node;
        try occupied.put(identity, {});
        stats.resources += 1;
    }
    const raw_count = (try tree.attributeValue(a, parent, "", "itemCnt")) orelse return error.MissingBorderFillCount;
    if (try @import("table_xml_fields.zig").unsigned(a, raw_count, 4096) != templates.count()) return error.BorderFillCountMismatch;
    const context = try solidContext(a, tree, parent);
    defer a.free(context);
    const Key = struct { source_id: u32, color: u32 };
    var clones = std.AutoHashMap(Key, u32).init(a);
    defer clones.deinit();
    const ids = try a.alloc(u32, requests.len);
    errdefer a.free(ids);
    var added: std.ArrayList(u8) = .empty;
    defer added.deinit(a);
    var next_id: u32 = 0;
    for (requests, 0..) |request, i| {
        try @import("../model/rgb_color.zig").validate(request.color);
        const template = templates.get(request.source_id) orelse return error.MissingBorderFillId;
        const key: Key = .{ .source_id = request.source_id, .color = request.color };
        if (clones.get(key)) |known| {
            ids[i] = known;
            stats.reused += 1;
            continue;
        }
        while (occupied.contains(next_id)) next_id = std.math.add(u32, next_id, 1) catch return error.LimitExceeded;
        const fragment = try solidFragment(a, tree, template, next_id, request.color, context, limit, profile);
        defer a.free(fragment);
        const length = std.math.add(usize, added.items.len, fragment.len) catch return error.LimitExceeded;
        if (length > limit - tree.source.len) return error.LimitExceeded;
        try added.appendSlice(a, fragment);
        try clones.put(key, next_id);
        try occupied.put(next_id, {});
        ids[i] = next_id;
        stats.fragments += 1;
    }
    const count = std.math.add(u32, templates.count(), clones.count()) catch return error.LimitExceeded;
    const token = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw_count.raw[0], count, raw_count.raw[0] });
    defer a.free(token);
    const start = @intFromPtr(raw_count.raw.ptr) - @intFromPtr(tree.source.ptr);
    const ending = tree.elements[parent].end_tag orelse return error.MissingBorderFillEndTag;
    const bytes = try @import("xml_source_writer.zig").write(a, tree.source, &.{ .{ .start = start, .end = start + raw_count.raw.len, .text = "", .serialized_xml = token }, .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = added.items } }, limit);
    stats.header_writes += 1;
    return .{ .bytes = bytes, .ids = ids };
}
