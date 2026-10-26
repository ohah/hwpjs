const std = @import("std");
const codec = @import("hwp5/edit/drawing_style_migration.zig");
const values: codec.Values = .{ .shadow = .{ .kind = 0, .color = 0x12345678, .offset_x = -720, .offset_y = 1440 }, .metadata = .{ .instance_id = 0x12345678, .reserved = 0, .shadow_alpha = 255 } };
const expected_tail = [_]u8{ 0, 0, 0, 0, 0x78, 0x56, 0x34, 0x12, 0x30, 0xfd, 0xff, 0xff, 0xa0, 5, 0, 0, 0x78, 0x56, 0x34, 0x12, 0, 255 };

fn convert(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    return codec.prepare(a, bytes, .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, values, 4_000_000);
}

test "drawing style migration actual seventeen empty fills preserve prefix and explicit inactive values" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "aligns", "multicolumns-in-common-controls" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        for (0..source.section_count) |index| {
            const raw = try source.decodeSection(a, index);
            defer a.free(raw);
            const original = try a.dupe(u8, raw);
            defer a.free(original);
            var tree = try @import("hwp5/edit/source_tree.zig").parse(a, raw, source.header.version(), .{});
            defer tree.deinit(a);
            for (tree.nodes, 0..) |node, node_index| {
                if (node.record.framing.tag != 76) continue;
                const layout = try @import("hwp5/body/shape_validation.zig").componentLayout(tree, node_index);
                const component = try @import("hwp5/body/shape_component.zig").Component.parse(node.record.framing.payload, layout);
                const out = try convert(a, component.extra);
                defer a.free(out);
                try std.testing.expectEqual(@as(usize, 21), component.extra.len);
                try std.testing.expectEqual(@as(usize, 43), out.len);
                try std.testing.expectEqualSlices(u8, component.extra, out[0..21]);
                try std.testing.expectEqualSlices(u8, &expected_tail, out[21..]);
                const target = try @import("hwp5/body/drawing_style.zig").Style.parseWithTail(out, .observed13, .alpha_shadow_metadata);
                try std.testing.expectEqualDeep(values.shadow, target.tail.known.shadow);
                try std.testing.expectEqualDeep(values.metadata, target.tail.known.metadata.?);
                count += 1;
            }
            try std.testing.expectEqualSlices(u8, original, raw);
        }
        try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
    }
    try std.testing.expectEqual(@as(usize, 17), count);
}

test "drawing style migration refuses guessed defaults opaque bytes and active shadow with full allocation sweep" {
    const a = std.testing.allocator;
    var input: [22]u8 = @splat(0);
    for (0..21) |length| try std.testing.expectError(error.UnexpectedEnd, convert(a, input[0..length]));
    try std.testing.expectError(error.UnsupportedDrawingMigrationSource, convert(a, &input));
    try std.testing.expectError(error.MissingDrawingMigrationValues, codec.prepare(a, input[0..21], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, null, 100));
    var active = values;
    active.shadow.kind = 1;
    try std.testing.expectError(error.UnsupportedDrawingMigrationValues, codec.prepare(a, input[0..21], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, active, 100));
    active = values;
    active.metadata.instance_id = 0;
    try std.testing.expectError(error.UnsupportedDrawingMigrationValues, codec.prepare(a, input[0..21], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, active, 100));
    active = values;
    active.metadata.reserved = 1;
    try std.testing.expectError(error.UnsupportedDrawingMigrationValues, codec.prepare(a, input[0..21], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, active, 100));
    try std.testing.expectError(error.UnsupportedDrawingMigrationTarget, codec.prepare(a, input[0..21], .{ .raw = 0x05000300 }, .{ .raw = 0x05000107 }, values, 100));
    try std.testing.expectError(error.LimitExceeded, codec.prepare(a, input[0..21], .{ .raw = 0x05000107 }, .{ .raw = 0x05000300 }, values, 42));
    input[13] = 128;
    try std.testing.expectError(error.UnsupportedDrawingMigrationSource, convert(a, input[0..21]));
    input[13] = 0;
    input[17] = 1;
    try std.testing.expectError(error.UnsupportedDrawingMigrationSource, convert(a, &input));
    input[17] = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const out = try convert(allocator, bytes);
            defer allocator.free(out);
            try std.testing.expectEqualSlices(u8, bytes, out[0..21]);
            try std.testing.expectEqual(@as(usize, 43), out.len);
            try std.testing.expectEqualSlices(u8, &expected_tail, out[21..]);
        }
    }.run, .{input[0..21]});
}
