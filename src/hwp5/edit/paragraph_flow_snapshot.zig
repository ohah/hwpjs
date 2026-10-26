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
    memo_index: ?u32 = null,
    memo_node: ?usize = null,
    empty_line_eligible: bool = false,
};
pub fn read(a: std.mem.Allocator, decoded: []const u8, version: Version, section: model.Section) ![]Flow {
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, decoded, version, .{});
    defer tree.deinit(a);
    var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, section, version, true);
    defer plan.deinit(a);
    var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
    defer groups.deinit(a);
    _ = try @import("../body/memo_validation.zig").inspect(tree, groups.items);
    var memos: std.AutoHashMapUnmanaged(usize, @import("../body/list_groups.zig").Group.Memo) = .empty;
    defer memos.deinit(a);
    for (groups.items) |group| if (group.memo) |memo| {
        try memos.put(a, group.header_node, memo);
    };
    var flows = try @import("../body/paragraph_flows.zig").Flows.build(a, tree, groups.items);
    defer flows.deinit(a);
    var lists: @import("../body/table_list_index.zig").Index = .{ .tree = tree };
    defer lists.deinit(a);
    const rows = try a.alloc(Flow, section.paragraphs.len);
    errdefer a.free(rows);
    for (section.paragraphs, rows, 0..) |p, *row, index| {
        const template = p.source_node orelse p.header_template orelse return error.MissingParagraphSource;
        if (template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
        const node = tree.nodes[template];
        const parent: ?u32 = if (node.parent) |value| @intCast(value) else null;
        if (p.parent_node != parent) return error.SourceBindingMismatch;
        const generated = p.source_node == null;
        const flags = try @import("paragraph_breaks.zig").current(generated, node.record.value.header.break_flags, p.break_before);
        const context = try @import("paragraph_flow_host.zig").read(a, &lists, flows, template);
        row.* = .{ .paragraph = index, .source_node = p.source_node, .template_node = template, .parent_node = parent, .generated = generated, .top_level = parent == null, .break_flags = flags, .section_break = flags & 1 != 0, .multicolumn_break = flags & 2 != 0, .page_break = flags & 4 != 0, .column_break = flags & 8 != 0 };
        row.host = context.host;
        row.list_node = context.list_node;
        row.empty_line_eligible = @import("empty_paragraph_source.zig").eligible(tree, template, p);
        if (context.list_node) |list| if (memos.get(list)) |memo| {
            row.memo_node = memo.node;
            row.memo_index = tree.nodes[memo.node].record.value.memo_list.memo_index;
        };
    }
    return rows;
}

test "HWP5 current empty flow follows generated paragraph edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("style_preservation.zig").Session.open(a, input);
    defer session.close();
    const end = try session.editableTextLength(a, 0, 1);
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = end } });
    const empty = try session.paragraphFlow(a, 0);
    defer a.free(empty);
    try std.testing.expect(empty[2].generated);
    try std.testing.expect(empty[2].empty_line_eligible);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "x" } });
    const text = try session.paragraphFlow(a, 0);
    defer a.free(text);
    try std.testing.expect(!text[2].empty_line_eligible);
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
