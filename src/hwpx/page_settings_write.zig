//! Prepare an immutable package; existing managed document history owns commit and travel.
const std = @import("std");
const t = @import("page_settings_edit_types.zig");
const editor = @import("editor_session.zig");
const writer = @import("xml_source_writer.zig");
const attrs = @import("xml_scalar_attributes_upsert.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Request = t.Request;
fn orientation(v: @import("page_geometry.zig").Orientation) []const u8 {
    return if (v == .widely) "WIDELY" else "NARROWLY";
}
fn binding(v: @import("page_geometry.zig").GutterType) []const u8 {
    return switch (v) {
        .left_only => "LEFT_ONLY",
        .left_right => "LEFT_RIGHT",
        .top_bottom => "TOP_BOTTOM",
    };
}
pub fn writeTree(a: std.mem.Allocator, tree: *const Tree, target: t.Target, values: t.Values, limit: usize) ![]u8 {
    try t.validate(values);
    if (t.equals(target.expected, values)) return a.dupe(u8, tree.source);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const p = tree.elements[target.page_node];
    const page_tag = try attrs.write(scratch, tree, target.page_node, &.{ "landscape", "width", "height", "gutterType" }, .{ orientation(values.orientation), try std.fmt.allocPrint(scratch, "{d}", .{values.width}), try std.fmt.allocPrint(scratch, "{d}", .{values.height}), binding(values.gutter_type) }, limit);
    const m = values.margin;
    const margin_values = .{ m.header, m.footer, m.gutter, m.left, m.right, m.top, m.bottom };
    const margin_names = [_][]const u8{ "header", "footer", "gutter", "left", "right", "top", "bottom" };
    var serialized: [7][]const u8 = undefined;
    inline for (margin_names, 0..) |_, i| serialized[i] = try std.fmt.allocPrint(scratch, "{d}", .{margin_values[i]});
    var changes: [2]writer.Change = undefined;
    changes[0] = .{ .start = p.start_tag.start, .end = p.start_tag.end, .text = "", .serialized_xml = page_tag };
    if (target.margin_node) |node| {
        const margin_tag = try attrs.write(scratch, tree, node, &margin_names, serialized, limit);
        const span = tree.elements[node].start_tag;
        changes[1] = .{ .start = span.start, .end = span.end, .text = "", .serialized_xml = margin_tag };
    } else {
        const fragment = try std.fmt.allocPrint(scratch, "<pg:margin xmlns:pg=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" header=\"{s}\" footer=\"{s}\" gutter=\"{s}\" left=\"{s}\" right=\"{s}\" top=\"{s}\" bottom=\"{s}\"/>", .{ serialized[0], serialized[1], serialized[2], serialized[3], serialized[4], serialized[5], serialized[6] });
        if (p.end_tag) |ending| {
            changes[1] = .{ .start = ending.start, .end = ending.start, .text = "", .serialized_xml = fragment };
        } else {
            var tag = try @import("xml_part_attributes.zig").parseStartTag(scratch, tree, target.page_node);
            defer tag.deinit(scratch);
            if (!std.mem.endsWith(u8, page_tag, "/>")) return error.InvalidSourceSpan;
            const expanded = try std.fmt.allocPrint(scratch, "{s}>{s}</{s}>", .{ page_tag[0 .. page_tag.len - 2], fragment, tag.name.raw });
            return writer.write(a, tree.source, &.{.{ .start = p.start_tag.start, .end = p.end, .text = "", .serialized_xml = expanded }}, limit);
        }
    }
    return writer.write(a, tree.source, &changes, limit);
}
/// Called after validateTargets(live Session). Saving pending edits can change
/// tree indexes; re-resolve the uniquely proved section owner in the saved tree.
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: Request, options: editor.Options) !?editor.Session {
    try t.validate(request.values);
    var current = try editor.open(a, before, options);
    defer current.deinit();
    const owners = try @import("page_settings_edit_owners.zig").observe(a, &current);
    defer a.free(owners);
    var replacements: std.ArrayList(@import("../zip/replace_writer.zig").Replacement) = .empty;
    defer {
        for (replacements.items) |r| a.free(r.bytes);
        replacements.deinit(a);
    }
    const seen = try a.alloc(bool, owners.len);
    defer a.free(seen);
    @memset(seen, false);
    for (request.targets) |target| {
        if (target.section >= owners.len or seen[target.section]) return error.InvalidPageSettingsTargets;
        seen[target.section] = true;
        const fresh = owners[target.section].target orelse return error.UnsupportedPageSettingsOwner;
        var expected = target.expected;
        expected.element_index = fresh.expected.element_index;
        if (!std.meta.eql(expected, fresh.expected)) return error.StalePageSettingsSnapshot;
        if (t.equals(fresh.expected, request.values)) continue;
        const tree = &current.sections[target.section].tree;
        const page_bytes = try writeTree(a, tree, fresh, request.values, options.max_xml_bytes);
        defer a.free(page_bytes);
        const bytes = try @import("page_settings_layout_cache.zig").remove(a, page_bytes, target.section, tree.item_index, options.max_xml_bytes);
        errdefer a.free(bytes);
        const entry = current.sections[target.section].entry_index;
        try replacements.append(a, .{ .entry_index = entry, .bytes = bytes });
    }
    if (replacements.items.len == 0) return null;
    const package = try @import("../zip/replace_writer.zig").write(a, before, replacements.items, .{ .max_output_bytes = options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, options);
}
