//! Table caption declarations only; current text membership belongs to paragraph flows.
const std = @import("std");
pub const Source = struct {
    control_node: usize,
    table_record_node: usize,
    list_node: usize,
    paragraph_count: u16,
    attributes: u32,
    unknown: ?u16,
    flags: u32,
    width: u32,
    gap: i16,
    max_text_width: u32,
    extra_bytes: usize,
    extra_nonzero: bool,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").table_id) continue;
        var lists = try @import("../body/table_lists.zig").Iterator.init(tree, index);
        while (lists.next()) |entry| {
            if (entry.kind != .caption) continue;
            const header = tree.nodes[entry.node].record.value.list_header;
            const view = try header.view(.observed8);
            const caption = try @import("../body/caption.zig").Caption.parse(view.extra);
            var nonzero = false;
            for (caption.extra) |byte| if (byte != 0) {
                nonzero = true;
                break;
            };
            try out.append(a, .{ .control_node = index, .table_record_node = lists.table_node, .list_node = entry.node, .paragraph_count = header.count_raw, .attributes = view.attributes, .unknown = view.unknown, .flags = caption.flags, .width = caption.width, .gap = caption.gap, .max_text_width = caption.max_text_width, .extra_bytes = caption.extra.len, .extra_nonzero = nonzero });
        }
    }
    return out.toOwnedSlice(a);
}
test "HWP5 caption sources actual lists and all allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "table-caption", "table2", "chart", "sample-5017", "table-position" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const expected = try read(a, bytes, source.header.version());
        defer a.free(expected);
        try std.testing.expect(expected.len > 0);
        for (expected) |row| {
            try std.testing.expect(row.control_node < row.list_node);
            try std.testing.expect(row.list_node < row.table_record_node);
            try std.testing.expect(row.paragraph_count > 0);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, rows: []const Source) !void {
                const values = try read(allocator, raw, version);
                defer allocator.free(values);
                try std.testing.expectEqualDeep(rows, values);
            }
        }.run, .{ bytes, source.header.version(), expected });
    }
}
