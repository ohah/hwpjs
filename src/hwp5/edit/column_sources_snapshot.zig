//! Owned source cold declarations; source offsets are not current text positions.
const std = @import("std");
const column = @import("../body/column_def.zig");
pub const Declaration = struct {
    current_paragraph: ?usize = null,
    current_unit: ?u32 = null,
    source_node: usize,
    paragraph_node: usize,
    flags: u32,
    count: u8,
    kind: u2,
    direction: u2,
    same_width: bool,
    spacing: ?i16,
    columns: []column.Column,
    line_type: u8,
    line_width: u8,
    color: u32,
    extra_bytes: usize,
};
/// Only source owners carry declarations; template continuations do not.
pub fn bindCurrent(a: std.mem.Allocator, rows: []Declaration, flows: []const @import("paragraph_flow_snapshot.zig").Flow) !void {
    var owners: std.AutoHashMapUnmanaged(u32, usize) = .empty;
    defer owners.deinit(a);
    for (flows) |flow| if (flow.source_node) |source| {
        const entry = try owners.getOrPut(a, source);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = flow.paragraph;
    };
    // Preflight every owner before publishing any mapping.
    for (rows) |row| {
        const source = std.math.cast(u32, row.paragraph_node) orelse return error.SourceBindingMismatch;
        if (!owners.contains(source)) return error.MissingColumnOwner;
    }
    for (rows) |*row| row.current_paragraph = owners.get(@intCast(row.paragraph_node)).?;
}
pub fn free(a: std.mem.Allocator, rows: []Declaration) void {
    for (rows) |row| a.free(row.columns);
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, decoded: []const u8, version: @import("../version.zig").Version) ![]Declaration {
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, decoded, version, .{});
    defer tree.deinit(a);
    var rows: std.ArrayList(Declaration) = .empty;
    errdefer {
        for (rows.items) |row| a.free(row.columns);
        rows.deinit(a);
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload);
        if (header.id != column.control_id) continue;
        const parent = try @import("../body/section_validation.zig").columnOwner(tree, index);
        const d = try column.Definition.parse(header.properties);
        const columns = try a.alloc(column.Column, if (d.columns) |values| values.count() else 0);
        errdefer a.free(columns);
        if (d.columns) |values| for (columns, 0..) |*value, ordinal| {
            value.* = values.get(ordinal).?;
        };
        try rows.append(a, .{ .source_node = index, .paragraph_node = parent, .flags = d.flags(), .count = d.count(), .kind = d.kind(), .direction = d.direction(), .same_width = d.sameWidth(), .spacing = d.spacing, .columns = columns, .line_type = d.line_type, .line_width = d.line_width, .color = d.color, .extra_bytes = d.extra.len });
    }
    return rows.toOwnedSlice(a);
}

test "HWP5 column sources actual equal variable and nested declarations all allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns", "multicolumns-widths", "multicolumns-in-common-controls" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const rows = try read(a, bytes, source.header.version());
        defer free(a, rows);
        try std.testing.expect(rows.len > 0);
        const flows = try a.alloc(@import("paragraph_flow_snapshot.zig").Flow, rows.len);
        defer a.free(flows);
        for (rows, flows, 0..) |row, *flow, index| {
            flow.* = .{ .paragraph = index * 2, .source_node = @intCast(row.paragraph_node), .template_node = @intCast(row.paragraph_node), .parent_node = null, .generated = false, .top_level = true, .break_flags = 0, .section_break = false, .multicolumn_break = false, .page_break = false, .column_break = false };
        }
        try @import("../../testing/allocation_failures.zig").check(struct {
            fn bind(allocator: std.mem.Allocator, declarations: []const Declaration, flow: []const @import("paragraph_flow_snapshot.zig").Flow) !void {
                const copy = try allocator.dupe(Declaration, declarations);
                defer allocator.free(copy);
                try bindCurrent(allocator, copy, flow);
                for (copy, 0..) |row, index| try std.testing.expectEqual(@as(?usize, index * 2), row.current_paragraph);
            }
        }.bind, .{ rows, flows });
        try std.testing.expectError(error.MissingColumnOwner, bindCurrent(a, rows, &.{}));
        for (rows) |row| try std.testing.expect(row.current_paragraph == null);
        try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, expected: []const Declaration) !void {
                const actual = try read(allocator, raw, version);
                defer free(allocator, actual);
                try std.testing.expectEqualDeep(expected, actual);
            }
        }.run, .{ bytes, source.header.version(), rows });
    }
}
