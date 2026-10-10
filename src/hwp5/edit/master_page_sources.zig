//! Original master-page list declarations; application order is not inferred.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Tree = @import("../body/tree.zig").Tree;
const controls = @import("../body/control_rules.zig");

pub const Source = struct {
    owner_node: usize,
    list_node: usize,
    paragraph_count: usize,
    list_attributes: u32,
    list_unknown: ?u16,
    width: u32,
    height: u32,
    text_reference: u8,
    number_reference: u8,
    extra_bytes: usize,
    extra_nonzero: bool,
};

pub fn read(a: std.mem.Allocator, raw: []const u8, version: Version) ![]Source {
    var tree = try Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
    defer groups.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (groups.items) |group| {
        const owner = tree.nodes[group.parent_node];
        if (owner.record.value != .control_header or owner.record.value.control_header.id != controls.section_id) continue;
        const area = try @import("paragraph_owner.zig").masterPageArea(tree, group.parent_node, group.header_node, version);
        const view = try tree.nodes[group.header_node].record.value.list_header.view(.observed8);
        var nonzero = false;
        for (area.extra) |byte| nonzero = nonzero or byte != 0;
        try out.append(a, .{
            .owner_node = group.parent_node,
            .list_node = group.header_node,
            .paragraph_count = group.paragraph_count,
            .list_attributes = view.attributes,
            .list_unknown = view.unknown,
            .width = area.width,
            .height = area.height,
            .text_reference = area.text_reference,
            .number_reference = area.number_reference,
            .extra_bytes = area.extra.len,
            .extra_nonzero = nonzero,
        });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 master page source actual list binds current master flow" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var input = try @import("../text_source.zig").Source.open(a, bytes);
    defer input.deinit();
    const raw = try input.decodeSection(a, 0);
    defer a.free(raw);
    const rows = try read(a, raw, input.header.version());
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(usize, 1), rows[0].paragraph_count);
    try std.testing.expectEqual(@as(usize, 16), rows[0].extra_bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    try std.testing.expectError(error.InvalidSection, session.masterPageSources(a, 999));
    const original = try session.masterPageSources(a, 0);
    defer a.free(original);
    try std.testing.expectEqualDeep(rows, original);
    // Explicit early-failure shard; this does not cover every allocation point.
    for (0..8) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, session.masterPageSources(failing.allocator(), 0));
        const retry = try session.masterPageSources(a, 0);
        defer a.free(retry);
        try std.testing.expectEqualDeep(original, retry);
    }
    const flow = try session.paragraphFlow(a, 0);
    defer a.free(flow);
    var matches: usize = 0;
    for (flow) |row| if (row.host == .master_page) {
        try std.testing.expectEqual(rows[0].owner_node, row.parent_node.?);
        try std.testing.expectEqual(rows[0].list_node, row.list_node.?);
        matches += 1;
    };
    try std.testing.expectEqual(rows[0].paragraph_count, matches);
    for (flow) |row| if (row.host == .master_page) {
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = row.paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "바탕😀" } });
        break;
    };
    const current = try session.masterPageSources(a, 0);
    defer a.free(current);
    try std.testing.expectEqualDeep(original, current);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.masterPageSources(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(current.len, restored.len);
    for (current, restored) |before, after| {
        var normalized = after;
        normalized.owner_node = before.owner_node;
        normalized.list_node = before.list_node;
        try std.testing.expectEqualDeep(before, normalized);
    }
}
