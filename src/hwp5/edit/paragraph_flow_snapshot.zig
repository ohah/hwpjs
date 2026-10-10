//! Current paragraph order and source break provenance; no invented page flow.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Flow = struct {
    paragraph: usize,
    source_node: ?u32,
    template_node: u32,
    parent_node: ?u32,
    generated: bool,
    top_level: bool,
    break_flags: u8,
    section_break: bool,
    multicolumn_break: bool,
    page_break: bool,
    column_break: bool,
    host: @import("paragraph_flow_host.zig").Host = .other,
    list_node: ?usize = null,
};
pub fn read(a: std.mem.Allocator, decoded: []const u8, version: Version, section: model.Section) ![]Flow {
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, decoded, version, .{});
    defer tree.deinit(a);
    var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, section, version, true);
    defer plan.deinit(a);
    var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const rows = try a.alloc(Flow, section.paragraphs.len);
    errdefer a.free(rows);
    for (section.paragraphs, rows, 0..) |p, *row, index| {
        const template = p.source_node orelse p.header_template orelse return error.MissingParagraphSource;
        if (template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
        const node = tree.nodes[template];
        const parent: ?u32 = if (node.parent) |value| @intCast(value) else null;
        if (p.parent_node != parent) return error.SourceBindingMismatch;
        const generated = p.source_node == null;
        const flags = @import("paragraph_breaks.zig").effective(generated, node.record.value.header.break_flags);
        const context = try @import("paragraph_flow_host.zig").read(tree, groups, template);
        row.* = .{ .paragraph = index, .source_node = p.source_node, .template_node = template, .parent_node = parent, .generated = generated, .top_level = parent == null, .break_flags = flags, .section_break = flags & 1 != 0, .multicolumn_break = flags & 2 != 0, .page_break = flags & 4 != 0, .column_break = flags & 8 != 0 };
        row.host = context.host;
        row.list_node = context.list_node;
    }
    return rows;
}

test "HWP5 current paragraph flow actual split generated continuation and all allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("style_preservation.zig").Session.open(a, input);
    defer session.close();
    const before = try session.paragraphFlow(a, 0);
    defer a.free(before);
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 1 } });
    const rows = try session.paragraphFlow(a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(before.len + 1, rows.len);
    try std.testing.expectEqual(before[1].break_flags, rows[1].break_flags);
    try std.testing.expect(rows[2].generated);
    try std.testing.expect(rows[2].source_node == null);
    try std.testing.expectEqual(@as(u8, 0), rows[2].break_flags);
    try std.testing.expectEqual(before[1].template_node, rows[2].template_node);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Flow) !void {
            const values = try s.paragraphFlow(allocator, 0);
            defer allocator.free(values);
            try std.testing.expectEqualDeep(expected, values);
        }
    }.run, .{ session, rows });
    try std.testing.expectError(error.InvalidSection, session.paragraphFlow(a, 1));
}

test "HWP5 current paragraph flow actual table header and note logical hosts" {
    const a = std.testing.allocator;
    const Host = @import("paragraph_flow_host.zig").Host;
    for ([_][]const u8{ "table", "headerfooter", "footnote-endnote" }, [_]Host{ .table_cell, .header, .footnote }) |name, expected| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        const session = try @import("style_preservation.zig").Session.open(a, bytes);
        defer session.close();
        const rows = try session.paragraphFlow(a, 0);
        defer a.free(rows);
        var found: usize = 0;
        for (rows) |row| {
            if (row.host == expected) {
                try std.testing.expect(!row.top_level);
                try std.testing.expect(row.list_node != null);
                found += 1;
            }
            if (row.top_level) try std.testing.expectEqual(Host.body, row.host);
        }
        try std.testing.expect(found > 0);
    }
}
