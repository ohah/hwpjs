const std = @import("std");
const Values = @import("hwp5/edit/character_resource_values.zig").Values;
const Version = @import("hwp5/version.zig").Version;
fn fixture(a: std.mem.Allocator) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    errdefer bytes.deinit(a);
    var map: [60]u8 = @splat(0);
    std.mem.writeInt(i32, map[36..40], 1, .little);
    const append = @import("hwp5/record_writer.zig").append;
    try append(a, &bytes, 17, 0, &map, 4096);
    try append(a, &bytes, 21, 1, &@as([68]u8, @splat(0)), 4096);
    try append(a, &bytes, 999, 2, "opaque child", 4096);
    try append(a, &bytes, 998, 1, "opaque next", 4096);
    return bytes.toOwnedSlice(a);
}
fn compare(a: std.mem.Allocator, values: *const Values, input: []const u8, limit: usize) !void {
    const raw = values.write(a, input, .{ .raw = 0x05000000 }, 1, limit) catch |expected| {
        try std.testing.expectError(expected, values.writeBatch(a, input, .{ .raw = 0x05000000 }, 1, limit));
        return;
    };
    defer a.free(raw);
    const batch = try values.writeBatch(a, input, .{ .raw = 0x05000000 }, 1, limit);
    defer a.free(batch);
    try std.testing.expectEqualSlices(u8, raw, batch);
}
test "atomic formatting regression: batch COW H5 canonical multi-resource output and every byte budget" {
    const a = std.testing.allocator;
    const input = try fixture(a);
    defer a.free(input);
    var values: Values = .{};
    defer values.deinit(a);
    for (0..14) |i| _ = try values.add(a, 1, 0, .{ .size = @intCast(1000 + i), .bold = i % 2 == 0 });
    const raw = try values.write(a, input, .{ .raw = 0x05000000 }, 1, 4096);
    defer a.free(raw);
    for (input.len - 1..raw.len + 2) |limit| try compare(a, &values, input, limit);
}
test "atomic formatting regression: batch COW H5 invalid late resource and earlier budget priority" {
    const a = std.testing.allocator;
    const input = try fixture(a);
    defer a.free(input);
    var values: Values = .{};
    defer values.deinit(a);
    try values.entries.append(a, .{ .source_id = 0, .properties = .{ .bold = true } });
    try values.entries.append(a, .{ .source_id = 1, .properties = .{ .size = -1 } });
    try compare(a, &values, input, 4096);
    try compare(a, &values, input, input.len);
    values.entries.items[1].source_id = 0;
    try compare(a, &values, input, 4096);
    try compare(a, &values, input, input.len);
}
test "atomic formatting regression: batch COW H5 write cleanup exhaustive allocation failures" {
    const input = try fixture(std.testing.allocator);
    defer std.testing.allocator.free(input);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            var values: Values = .{};
            defer values.deinit(a);
            _ = try values.add(a, 1, 0, .{ .size = 1100 });
            _ = try values.add(a, 1, 0, .{ .italic = true });
            const output = try values.writeBatch(a, bytes, .{ .raw = 0x05000000 }, 1, 4096);
            defer a.free(output);
        }
    }.run, .{input});
}

test "atomic formatting regression: batch COW HX indexed intent first match sparse IDs and allocation rollback" {
    const a = std.testing.allocator;
    const module = @import("hwpx/character_resource_values.zig");
    const originals = [_]u32{ 0, 9, 300, std.math.maxInt(u32) };
    var raw: module.Values = .{};
    defer raw.deinit(a);
    var candidate: module.Values = .{};
    defer candidate.deinit(a);
    var index: module.Index = .{};
    defer index.deinit(a);
    for (0..64) |n| {
        const patch: @import("model/document.zig").CharacterPropertyPatch = .{ .size = @intCast(1000 + n % 16), .bold = n % 2 == 0, .font_ids = .{ 1, null, null, null, null, null, null } };
        try std.testing.expectEqual(try raw.add(a, &originals, 9, patch), try candidate.addIndexed(a, &originals, 9, patch, &index));
    }
    try std.testing.expectEqualDeep(raw.entries.items, candidate.entries.items);
    try std.testing.expectError(error.InvalidCharacterShapeReference, candidate.addIndexed(a, &originals, 10, .{}, &index));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var values: module.Values = .{};
            defer values.deinit(allocator);
            var lookup: module.Index = .{};
            defer lookup.deinit(allocator);
            for (0..4) |n| _ = try values.addIndexed(allocator, &originals, 9, .{ .size = @intCast(1000 + n) }, &lookup);
        }
    }.run, .{});
}
