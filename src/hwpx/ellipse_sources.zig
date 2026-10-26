//! Request-local source-only ellipse inventory with current protected anchors.
const std = @import("std");
const editor = @import("editor_session.zig");
const geometry = @import("ellipse_geometry_values.zig");
const hosts = @import("drawing_display_host.zig");
const policy: hosts.Policy = .{ .local = "ellipse", .kind = .ellipse, .invalid_node = error.InvalidEllipseGeometryNode, .switch_host = error.UnsupportedEllipseSwitchHost, .missing_paragraph = error.MissingEllipseDisplayParagraph, .unsupported_anchor = error.UnsupportedEllipseAnchor };
const Row = struct {
    node: usize,
    owner: struct { paragraph: usize, anchor_node: usize, anchor_unit: usize },
    local: geometry.Values,
    common: @import("ellipse_common_source.zig").Source,
    pub fn jsonStringify(self: Row, writer: anytype) !void {
        try writer.write(.{ .sourceOnly = true, .node = self.node, .owner = self.owner, .common = self.common, .geometry = .{
            .interval_dirty = self.local.interval_dirty,
            .has_arc_properties = self.local.has_arc_properties,
            .arc_type = self.local.arc_type,
            .points = self.local.points,
        } });
    }
};
pub fn encode(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]u8 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "ellipse")) continue;
        if (nodes.items.len >= 100000) return error.LimitExceeded;
        try nodes.append(a, node);
    }
    if (nodes.items.len == 0) return a.dupe(u8, "[]");
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var rows: std.ArrayList(Row) = .empty;
    defer {
        for (rows.items) |*row| row.local.deinit();
        rows.deinit(a);
    }
    for (nodes.items) |node| {
        const paragraph = try hosts.currentOrdinal(tree, current.paragraphs, section.first_paragraph, node, policy);
        const anchor_node = try hosts.sourceAnchor(tree, node, policy);
        const anchor_unit = try hosts.anchorUnit(a, tree, &current.paragraphs[paragraph - section.first_paragraph], node, policy);
        var local = try geometry.read(a, tree, node);
        errdefer local.deinit();
        const common = try @import("ellipse_common_source.zig").read(a, tree, node);
        try rows.append(a, .{ .node = node, .owner = .{ .paragraph = paragraph, .anchor_node = anchor_node, .anchor_unit = anchor_unit }, .local = local, .common = common });
    }
    return std.json.Stringify.valueAlloc(a, rows.items, .{});
}

test "ellipse source query follows actual edited anchors without retaining a paragraph cache" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/복학원서.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const original = try encode(a, &session, 0);
    defer a.free(original);
    try std.testing.expect(std.mem.indexOf(u8, original, "\"sourceOnly\":true") != null);
    _ = try session.spliceAnchored(0, 56, 0, 0, "앞😀");
    const changed = try encode(a, &session, 0);
    defer a.free(changed);
    const before = try std.json.parseFromSlice(std.json.Value, a, original, .{});
    defer before.deinit();
    const after = try std.json.parseFromSlice(std.json.Value, a, changed, .{});
    defer after.deinit();
    try std.testing.expectEqual(@as(usize, 1), before.value.array.items.len);
    try std.testing.expectEqual(@as(usize, 1), after.value.array.items.len);
    const first = before.value.array.items[0].object.get("owner").?.object;
    const second = after.value.array.items[0].object.get("owner").?.object;
    try std.testing.expectEqual(@as(i64, 56), first.get("paragraph").?.integer);
    try std.testing.expectEqual(first.get("anchor_unit").?.integer + 3, second.get("anchor_unit").?.integer);
    const common = before.value.array.items[0].object.get("common").?.object;
    try std.testing.expectEqual(@as(i64, 6710), common.get("geometry").?.object.get("width").?.integer);
    try std.testing.expectEqual(@as(i64, 6333), common.get("geometry").?.object.get("height").?.integer);
    try std.testing.expectEqual(@as(i64, 45854), common.get("geometry").?.object.get("horizontal_offset").?.integer);
    try std.testing.expectEqual(@as(i64, 71319), common.get("geometry").?.object.get("vertical_offset").?.integer);
    try std.testing.expectEqual(@as(i64, 3), common.get("flow").?.object.get("text_wrap").?.integer);
    try std.testing.expect(common.get("rendering").?.object.get("matrix").? == .array);
    const stroke = common.get("stroke").?.object;
    try std.testing.expectEqual(@as(i64, 0xff0000), stroke.get("color").?.integer);
    try std.testing.expectEqual(@as(i64, 0), stroke.get("width").?.integer);
    try std.testing.expect(common.get("stroke_error").? == .null);
    try std.testing.expect(common.get("paint").?.object.get("fill_node").? == .null);
    try std.testing.expectEqual(@as(i64, 0), common.get("paint").?.object.get("shadow_type").?.integer);
    try std.testing.expectError(error.InvalidSectionIndex, encode(a, &session, session.sections.len));
}

test "ellipse empty inventory allocates only the detached empty response" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var limited = std.testing.FailingAllocator.init(a, .{ .fail_index = 1 });
    const allocator = limited.allocator();
    const response = try encode(allocator, &session, 0);
    defer allocator.free(response);
    try std.testing.expectEqualStrings("[]", response);
    var none = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, encode(none.allocator(), &session, 0));
}
