//! Observed note declarations plus current reference anchors, not note pagination.
const std = @import("std");
const note = @import("../body/note_control.zig");
pub const Source = struct {
    kind: note.Kind,
    control_node: usize,
    list_node: usize,
    paragraph_count: usize,
    paragraph: usize,
    source_unit: usize,
    current_unit: u32,
    number: u32,
    prefix: u16,
    suffix: u16,
    number_shape: u32,
    instance_id: ?u32,
    control_extra_bytes: usize,
    control_extra_nonzero: bool,
    list_attributes: u32,
    list_unknown: ?u16,
    list_extra_bytes: usize,
    list_extra_nonzero: bool,
};
fn nonzero(bytes: []const u8) bool {
    for (bytes) |byte| if (byte != 0) return true;
    return false;
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    _ = try @import("../body/note_validation.zig").inspect(tree, groups.items, .observed12, .observed8);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    var link_indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer link_indices.deinit(a);
    for (links.items, 0..) |link, index| {
        const entry = try link_indices.getOrPut(a, link.control_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    // Group order and link order differ when notes are nested inside an earlier host.
    for (groups.items) |group| {
        const control = tree.nodes[group.parent_node].record.value;
        if (control != .control_header) continue;
        const kind = note.kind(control.control_header.id) orelse continue;
        const index = link_indices.get(group.parent_node) orelse return error.MissingNoteAnchor;
        const link = links.items[index];
        if (link.code != 17) return error.UnsupportedNoteAnchor;
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingCurrentNoteOwner;
        const unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]);
        const properties = try note.Properties.parse(tree.nodes[link.control_node].record.value.control_header.properties, .observed12);
        const value = properties.observed orelse return error.OpaqueNoteProperties;
        const view = try tree.nodes[group.header_node].record.value.list_header.view(.observed8);
        try out.append(a, .{ .kind = kind, .control_node = link.control_node, .list_node = group.header_node, .paragraph_count = group.paragraph_count, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = unit, .number = value.number, .prefix = value.prefix, .suffix = value.suffix, .number_shape = value.number_shape, .instance_id = value.instance_id, .control_extra_bytes = properties.extra.len, .control_extra_nonzero = nonzero(properties.extra), .list_attributes = view.attributes, .list_unknown = view.unknown, .list_extra_bytes = view.extra.len, .list_extra_nonzero = nonzero(view.extra) });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 note sources actual repeated references raw observed values and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const original = try session.noteSources(a, 0);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 4), original.len);
    for (original, 0..) |row, index| {
        try std.testing.expectEqual(if (index < 2) note.Kind.footnote else note.Kind.endnote, row.kind);
        try std.testing.expectEqual(@as(u32, @intCast(index % 2 + 1)), row.number);
        try std.testing.expectEqual(@as(u16, 41), row.suffix);
        try std.testing.expectEqual(@as(?u32, null), row.instance_id);
        try std.testing.expectEqual(@as(usize, 4), row.control_extra_bytes);
        try std.testing.expect(row.control_extra_nonzero);
        try std.testing.expectEqual(@as(usize, 8), row.list_extra_bytes);
        try std.testing.expect(!row.list_extra_nonzero);
        try std.testing.expectEqual(row.source_unit, row.current_unit);
    }
    const host = original[0].paragraph;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = host, .start_unit = 0, .end_unit = 0, .utf8 = "주석😀" } });
    const shifted = try session.noteSources(a, 0);
    defer a.free(shifted);
    for (original, shifted) |before, after| {
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + @as(u32, if (before.paragraph == host) 4 else 0), after.current_unit);
        try std.testing.expectEqual(before.number, after.number);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Source) !void {
            const rows = try s.noteSources(allocator, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ session, shifted });
}

test "HWP5 note sources actual textbox and body references do not share traversal order assumptions" {
    const a = std.testing.allocator;
    const bytes = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/footnote-tbox-01.hwp", a, .limited(4_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const rows = try session.noteSources(a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    var body = false;
    var drawing = false;
    for (rows) |row| {
        try std.testing.expectEqual(row.source_unit, row.current_unit);
        for (flows) |flow| if (flow.paragraph == row.paragraph) {
            body = body or flow.host == .body;
            drawing = drawing or flow.host == .drawing;
        };
    }
    try std.testing.expect(body and drawing);
}
