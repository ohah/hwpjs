const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const Flow = @import("paragraph_flow_snapshot.zig").Flow;

test "actual memo paragraph flow preserves marker identity without flattening into body" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "issue5866/memo_field_hwp5.hwp", "basic/english.hwp", "aift.hwp" }, [_]usize{ 0, 0, 2 }, [_]usize{ 1, 15, 2 }) |name, section, expected| {
        const path = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(32_000_000));
        defer a.free(input);
        const session = try Session.open(a, input);
        defer session.close();
        const rows = try session.paragraphFlow(a, section);
        defer a.free(rows);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, section);
        defer a.free(raw);
        var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        var markers: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer markers.deinit(a);
        for (rows) |row| {
            if (row.memo_node) |node| {
                try std.testing.expectEqual(@as(u10, 93), tree.nodes[node].record.framing.tag);
                try std.testing.expectEqual(std.mem.readInt(u32, tree.nodes[node].record.framing.payload[0..4], .little), row.memo_index.?);
                try std.testing.expectEqual(node + 1, row.list_node.?);
                try std.testing.expectEqual(@as(u10, 72), tree.nodes[row.list_node.?].record.framing.tag);
                try std.testing.expect(!row.top_level and row.host == .other);
                try markers.put(a, node, {});
            } else try std.testing.expectEqual(@as(?u32, null), row.memo_index);
        }
        try std.testing.expectEqual(expected, markers.count());
        if (section == 0 and expected == 1) try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, value: *const Session, wanted: []const Flow) !void {
                const actual = try value.paragraphFlow(allocator, 0);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(wanted, actual);
            }
        }.run, .{ session, rows });
        const saved = try session.save(a, .{});
        defer a.free(saved.bytes);
        try std.testing.expectEqualSlices(u8, input, saved.bytes);
    }
}
