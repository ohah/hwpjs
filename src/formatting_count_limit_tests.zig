const std = @import("std");
const display = @import("hwp5/edit/character_display_shapes.zig");
const Values = @import("hwp5/edit/character_resource_values.zig").Values;
test "atomic formatting regression: batch count phase last operation append then next read refusal uses original authority" {
    const a = std.testing.allocator;
    const maximum = display.read_count_limit;
    const limit = 16 * 1024 * 1024;
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[36..40], @intCast(maximum), .little);
    const append = @import("hwp5/record_writer.zig").append;
    try append(a, &info, 17, 0, &mapping, limit);
    for (0..maximum) |_| try append(a, &info, 21, 1, &@as([68]u8, @splat(0)), limit);
    const version: @import("hwp5/version.zig").Version = .{ .raw = 0x05000000 };
    const original_shapes = try display.read(a, info.items, version, maximum);
    a.free(original_shapes);
    var context = @import("hwp5/edit/character_batch_shape_context.zig").Context.initAfterValidation(info.items, version, maximum, limit);
    defer context.deinit(a);
    const entries = [_]@import("model/document.zig").CharacterResourceIntent{
        .{ .source_id = 0, .properties = .{ .size = 1200 } },
        .{ .source_id = 1, .properties = .{ .size = 1300 } },
        .{ .source_id = 2, .properties = .{ .size = 1400 } },
    };
    // All three are appended inside the same already-admitted logical operation.
    const generated = (try context.resolve(a, &entries, @intCast(maximum + 1))).?;
    try std.testing.expectEqual(@as(i32, 1300), generated.height);
    const values: Values = .{ .entries = .{ .items = @constCast(&entries), .capacity = entries.len, .pointer_stability = .{} } };
    const final = try values.writeBatch(a, info.items, version, maximum, limit);
    defer a.free(final);
    try std.testing.expectEqual(@as(i32, @intCast(maximum + 3)), std.mem.readInt(i32, final[40..44], .little));
    try std.testing.expectError(error.LimitExceeded, display.read(a, final, version, maximum + 3));
    try std.testing.expectError(error.LimitExceeded, values.writeBatch(a, info.items, version, maximum, final.len - 1));
    std.debug.print("COUNT_PHASE original={d} appended=3 final={d} nextRead=LimitExceeded bytes={d}\n", .{ maximum, maximum + 3, final.len });
}
