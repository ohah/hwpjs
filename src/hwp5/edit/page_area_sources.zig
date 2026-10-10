//! Immutable head/foot declarations; current paragraph membership is a separate flow.
const std = @import("std");
const hf = @import("../body/header_footer.zig");
pub const Source = struct {
    kind: enum { header, footer },
    owner_node: usize,
    list_node: usize,
    paragraph_count: usize,
    control_attributes: u32,
    list_attributes: u32,
    list_unknown: ?u16,
    width: u32,
    height: u32,
    text_references: u8,
    number_references: u8,
    control_extra_bytes: usize,
    control_extra_nonzero: bool,
    control_instance_id: ?u32 = null,
    list_extra_bytes: usize,
    list_extra_nonzero: bool,
};
fn nonzero(bytes: []const u8) bool {
    for (bytes) |byte| if (byte != 0) return true;
    return false;
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    _ = try @import("../body/header_footer_validation.zig").inspect(tree, groups.items, .observed8);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (groups.items) |group| {
        const owner = tree.nodes[group.parent_node];
        if (owner.record.value != .control_header) continue;
        const control = owner.record.value.control_header;
        if (!hf.supports(control.id)) continue;
        const properties = try hf.Properties.parse(control.properties);
        const view = try tree.nodes[group.header_node].record.value.list_header.view(.observed8);
        const area = try hf.Area.parse(view.extra);
        try out.append(a, .{
            .kind = if (control.id == @import("../body/control_rules.zig").id("head")) .header else .footer,
            .owner_node = group.parent_node,
            .list_node = group.header_node,
            .paragraph_count = group.paragraph_count,
            .control_attributes = properties.attributes,
            .list_attributes = view.attributes,
            .list_unknown = view.unknown,
            .width = area.width,
            .height = area.height,
            .text_references = area.text_references,
            .number_references = area.number_references,
            .control_extra_bytes = properties.extra.len,
            .control_extra_nonzero = nonzero(properties.extra),
            .control_instance_id = properties.observedInstanceId(),
            .list_extra_bytes = area.extra.len,
            .list_extra_nonzero = nonzero(area.extra),
        });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 page area source actual split control list profile and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var input = try @import("../text_source.zig").Source.open(a, bytes);
    defer input.deinit();
    const raw = try input.decodeSection(a, 0);
    defer a.free(raw);
    const rows = try read(a, raw, input.header.version());
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqual(.header, rows[0].kind);
    try std.testing.expectEqual(.footer, rows[1].kind);
    try std.testing.expectEqual(@as(u32, 0), rows[0].control_attributes);
    try std.testing.expectEqual(@as(u32, 2), rows[1].control_attributes);
    try std.testing.expectEqual(@as(u32, 0), rows[0].list_attributes);
    try std.testing.expectEqual(@as(u32, 64), rows[1].list_attributes);
    try std.testing.expectEqual(@as(usize, 16), rows[0].owner_node);
    try std.testing.expectEqual(@as(usize, 17), rows[0].list_node);
    try std.testing.expectEqual(@as(usize, 23), rows[1].owner_node);
    try std.testing.expectEqual(@as(usize, 24), rows[1].list_node);
    for (rows) |row| {
        try std.testing.expectEqual(@as(u32, 42520), row.width);
        try std.testing.expectEqual(@as(u32, 4252), row.height);
        try std.testing.expectEqual(@as(usize, 1), row.paragraph_count);
        try std.testing.expectEqual(@as(usize, 4), row.control_extra_bytes);
        try std.testing.expectEqual(@as(usize, 16), row.list_extra_bytes);
        try std.testing.expectEqual(@as(?u16, 0), row.list_unknown);
        try std.testing.expectEqual(@as(u8, 0), row.text_references);
        try std.testing.expectEqual(@as(u8, 0), row.number_references);
        try std.testing.expect(!row.control_extra_nonzero and !row.list_extra_nonzero);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, decoded: []const u8, version: @import("../version.zig").Version, expected: []const Source) !void {
            const actual = try read(allocator, decoded, version);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw, input.header.version(), rows });
}

test "HWP5 page area source session stays immutable during actual header text edits" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    try std.testing.expectError(error.InvalidSection, session.pageAreaSources(a, 999));
    const original = try session.pageAreaSources(a, 0);
    defer a.free(original);
    const flow = try session.paragraphFlow(a, 0);
    defer a.free(flow);
    var target: ?usize = null;
    for (flow) |row| if (row.host == .header) {
        target = row.paragraph;
        break;
    };
    const paragraph = target orelse return error.MissingTestHeader;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "머리말😀" } });
    const current = try session.pageAreaSources(a, 0);
    defer a.free(current);
    try std.testing.expectEqualDeep(original, current);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.pageAreaSources(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(current.len, restored.len);
    const reopened_flow = try reopened.paragraphFlow(a, 0);
    defer a.free(reopened_flow);
    for (current, restored) |before, after| {
        var values = after;
        values.owner_node = before.owner_node;
        values.list_node = before.list_node;
        try std.testing.expectEqualDeep(before, values);
        var bound = false;
        for (reopened_flow) |row| {
            if (row.host == (if (after.kind == .header) @import("paragraph_flow_host.zig").Host.header else .footer) and row.list_node == after.list_node) bound = true;
        }
        try std.testing.expect(bound);
    }
}
