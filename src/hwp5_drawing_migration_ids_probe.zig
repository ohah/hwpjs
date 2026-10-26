const std = @import("std");
const ids = @import("hwp5/edit/drawing_migration_ids.zig");

test {
    _ = @import("hwp5/edit/created_table_ids_tests.zig");
}

test "drawing migration IDs reserve all source paragraphs objects and caller history before batch allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const before = try a.dupe(u8, raw);
    defer a.free(before);
    // A different section reserves paragraph2/object1. History/current reserves3.
    var other: std.ArrayList(u8) = .empty;
    defer other.deinit(a);
    var paragraph: [22]u8 = @splat(0);
    std.mem.writeInt(u32, paragraph[18..22], 2, .little);
    try @import("hwp5/record_writer.zig").append(a, &other, 66, 0, &paragraph, 1000);
    var object: [44]u8 = @splat(0);
    std.mem.writeInt(u32, object[0..4], 0x74626c20, .little);
    std.mem.writeInt(u32, object[36..40], 1, .little);
    try @import("hwp5/record_writer.zig").append(a, &other, 71, 1, &object, 1000);
    const sources = [_][]const u8{ raw, other.items };
    const planned = try ids.plan(a, &sources, source.header.version(), &.{ 0, 3, 3, 0xffffffff }, 17, 10000);
    defer a.free(planned);
    const again = try ids.plan(a, &sources, source.header.version(), &.{ 0, 3, 3, 0xffffffff }, 17, 10000);
    defer a.free(again);
    try std.testing.expectEqualSlices(u32, planned, again);
    try std.testing.expectEqual(@as(usize, 17), planned.len);
    const after = try ids.plan(a, &sources, source.header.version(), planned, 2, 10000);
    defer a.free(after);
    for (after) |id| try std.testing.expect(std.mem.indexOfScalar(u32, planned, id) == null);
    for (planned, 0..) |id, index| {
        try std.testing.expect(id > 3 and id != 0xffffffff);
        if (index > 0) try std.testing.expect(id > planned[index - 1]);
        for (sources) |bytes| {
            var it = @import("hwp5/record.zig").Iterator.init(bytes, .{});
            while (try it.next()) |record| {
                if (record.tag == 66) try std.testing.expect(id != std.mem.readInt(u32, record.payload[18..22], .little));
                if (record.tag == 71) {
                    const control = try @import("hwp5/body/control_header.zig").Header.parse(record.payload);
                    if (@import("hwp5/body/object_common.zig").supports(control.id)) try std.testing.expect(id != std.mem.readInt(u32, control.properties[32..36], .little));
                }
            }
        }
    }
    try std.testing.expectError(error.LimitExceeded, ids.plan(a, &sources, source.header.version(), &.{}, 1, 0));
    try std.testing.expectError(error.UnsupportedDrawingMigrationTarget, ids.plan(a, &sources, .{ .raw = 0x05000300 }, &.{}, 0, 10000));
    const changed_other = try a.dupe(u8, other.items);
    defer a.free(changed_other);
    // Unknown controls cannot be assumed to contain no further instance IDs.
    std.mem.writeInt(u32, changed_other[30..34], 0x12345678, .little);
    try std.testing.expectError(error.UnsupportedDrawingMigrationSource, ids.plan(a, &.{ raw, changed_other }, source.header.version(), &.{}, 1, 10000));
    std.mem.writeInt(u32, changed_other[30..34], 0x61746e6f, .little);
    try std.testing.expectError(error.UnsupportedDrawingMigrationSource, ids.plan(a, &.{ raw, changed_other }, source.header.version(), &.{}, 1, 10000));
    var source_tree = try @import("hwp5/edit/source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer source_tree.deinit(a);
    var converted: usize = 0;
    for (source_tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 76) continue;
        const layout = try @import("hwp5/body/shape_validation.zig").componentLayout(source_tree, index);
        const component = try @import("hwp5/body/shape_component.zig").Component.parse(node.record.framing.payload, layout);
        const out = try @import("hwp5/edit/drawing_style_migration.zig").prepare(a, component.extra, source.header.version(), .{ .raw = 0x05000300 }, .{ .shadow = .{ .kind = 0, .color = 0, .offset_x = 0, .offset_y = 0 }, .metadata = .{ .instance_id = planned[converted], .reserved = 0, .shadow_alpha = 0 } }, 1000);
        defer a.free(out);
        try std.testing.expectEqual(planned[converted], std.mem.readInt(u32, out[37..41], .little));
        try std.testing.expectEqualSlices(u8, component.extra, out[0..21]);
        converted += 1;
    }
    try std.testing.expectEqual(@as(usize, 16), converted);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, other_bytes: []const u8, expected: []const u32) !void {
            const result = try ids.plan(allocator, &.{ bytes, other_bytes }, .{ .raw = 0x05000107 }, &.{ 0, 3, 3, 0xffffffff }, 17, 10000);
            defer allocator.free(result);
            try std.testing.expectEqualSlices(u32, expected, result);
        }
    }.run, .{ raw, other.items, planned });
    try std.testing.expectEqualSlices(u8, before, raw);
}
