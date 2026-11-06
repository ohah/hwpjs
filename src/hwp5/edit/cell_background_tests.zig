const std = @import("std");
const a = std.testing.allocator;

test "cell background HWP5 explicit no-fill construction derives RGB including black while generic writer stays strict" {
    for ([_]usize{ 36, 40 }) |length| for ([_]u32{ 0, 0x123456 }) |color| {
        const original: [40]u8 = @splat(0);
        const input = original[0..length];
        try std.testing.expectError(error.IncompleteBackgroundCreation, @import("border_fill_payload_patch.zig").write(a, input, .{ .background = .{ .solid = .{ .color = color } } }, 4096));
        const patch = try @import("cell_background_values.zig").solidPatch(input, color);
        try std.testing.expectEqual(@as(?u32, color), patch.background.?.solid.hatch_color);
        const output = try @import("border_fill_payload_patch.zig").write(a, input, patch, 4096);
        defer a.free(output);
        const wire = ((color >> 16) & 255) | (color & 0xff00) | ((color & 255) << 16);
        try std.testing.expectEqual(length + 12, output.len);
        try std.testing.expectEqualSlices(u8, input[0..32], output[0..32]);
        try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, output[32..36], .little));
        try std.testing.expectEqual(wire, std.mem.readInt(u32, output[36..40], .little));
        try std.testing.expectEqual(wire, std.mem.readInt(u32, output[40..44], .little));
        try std.testing.expectEqual(@as(i32, -1), std.mem.readInt(i32, output[44..48], .little));
        try std.testing.expectEqualSlices(u8, input[36..], output[48..]);
        try std.testing.expectEqualSlices(u8, &@as([40]u8, @splat(0)), &original);
    };
}

test "cell background HWP5 constructor does not bypass opaque alpha extension and image guards" {
    for ([_]u32{ 8, 0 }) |flags| {
        var original: [41]u8 = @splat(0);
        std.mem.writeInt(u32, original[32..36], flags, .little);
        original[40] = 1;
        const patch = try @import("cell_background_values.zig").solidPatch(&original, 0);
        try std.testing.expectEqual(@as(?u32, null), patch.background.?.solid.hatch_color);
        if (flags == 8)
            try std.testing.expectError(error.UnsupportedOpaqueBackground, @import("border_fill_payload_patch.zig").write(a, &original, patch, 4096))
        else
            try std.testing.expectError(error.UnsupportedBackgroundAlphaCombination, @import("border_fill_payload_patch.zig").write(a, &original, patch, 4096));
    }
    var extended: [41]u8 = @splat(0);
    std.mem.writeInt(u32, extended[36..40], 1, .little);
    const extended_patch = try @import("cell_background_values.zig").solidPatch(&extended, 0);
    try std.testing.expectEqual(@as(?u32, null), extended_patch.background.?.solid.hatch_color);
    try std.testing.expectError(error.UnsupportedBackgroundExtension, @import("border_fill_payload_patch.zig").write(a, &extended, extended_patch, 4096));
    var image: [46]u8 = @splat(0);
    std.mem.writeInt(u32, image[32..36], 2, .little);
    const image_patch = try @import("cell_background_values.zig").solidPatch(&image, 0);
    try std.testing.expectEqual(@as(?u32, null), image_patch.background.?.solid.hatch_color);
    try std.testing.expectError(error.UnsupportedOpaqueBackground, @import("border_fill_payload_patch.zig").write(a, &image, image_patch, 4096));
}

test "cell background HWP5 COW preserves source and borders under allocation failures" {
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(alloc: std.mem.Allocator) !void {
            var original: std.ArrayList(u8) = .empty;
            defer original.deinit(alloc);
            var mapping: [60]u8 = @splat(0);
            std.mem.writeInt(i32, mapping[32..36], 1, .little);
            var payload: [48]u8 = @splat(0);
            std.mem.writeInt(u32, payload[32..36], 1, .little);
            std.mem.writeInt(u32, payload[36..40], 0x112233, .little);
            std.mem.writeInt(u32, payload[40..44], 0x445566, .little);
            std.mem.writeInt(i32, payload[44..48], -1, .little);
            try @import("../record_writer.zig").append(alloc, &original, 17, 0, &mapping, 4096);
            try @import("../record_writer.zig").append(alloc, &original, 20, 1, &payload, 4096);
            const entries = [_]@import("cell_background_values.zig").Entry{.{ .edit = .{ .section = 0, .table_node = 1, .list_node = 2, .color = 0x123456 }, .source_id = 1 }};
            var result = try @import("cell_background_write.zig").info(alloc, original.items, .{ .raw = 0x05000000 }, &entries, 4096);
            defer result.deinit(alloc);
            try std.testing.expectEqual(@as(u16, 2), result.refs[0].id);
            const original_resource = try @import("border_fill_docinfo_patch.zig").resource(result.bytes, 1);
            try std.testing.expectEqualSlices(u8, &payload, original_resource);
            const changed = try @import("border_fill_docinfo_patch.zig").resource(result.bytes, 2);
            var expected = payload;
            std.mem.writeInt(u32, expected[36..40], 0x563412, .little);
            try std.testing.expectEqualSlices(u8, &expected, changed);
        }
    }.run, .{});
}

test "cell background HWP5 batch deduplicates many shared owners into one clone" {
    var original: std.ArrayList(u8) = .empty;
    defer original.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[32..36], 1, .little);
    var payload: [48]u8 = @splat(0);
    std.mem.writeInt(u32, payload[32..36], 1, .little);
    std.mem.writeInt(u32, payload[36..40], 0x112233, .little);
    std.mem.writeInt(u32, payload[40..44], 0x445566, .little);
    std.mem.writeInt(i32, payload[44..48], -1, .little);
    try @import("../record_writer.zig").append(a, &original, 17, 0, &mapping, 4096);
    try @import("../record_writer.zig").append(a, &original, 20, 1, &payload, 4096);
    var entries: [128]@import("cell_background_values.zig").Entry = undefined;
    for (&entries, 0..) |*entry, index| entry.* = .{ .edit = .{ .section = index % 4, .table_node = 1, .list_node = @intCast(index + 2), .color = 0x123456 }, .source_id = 1 };
    var prepared = try @import("cell_background_write.zig").info(a, original.items, .{ .raw = 0x05000000 }, &entries, 4096);
    defer prepared.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), prepared.sections.count());
    try std.testing.expectEqual(original.items.len + 52, prepared.bytes.len);
    for (entries) |entry| try std.testing.expectEqual(@as(?u16, 2), prepared.lookup(entry.edit.section, entry.edit.table_node, entry.edit.list_node));
}
