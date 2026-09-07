const std = @import("std");
const t = std.testing;
const gamma = @import("gamma.zig");
const chroma = @import("chromaticities.zig");
test "PNG fixed color fields preserve zero and exact unsigned wire boundaries" {
    var bytes: [4]u8 = undefined;
    for ([_]u32{ 0, 1, 45455, 100000, 100001, 0x7fffffff }) |n| {
        std.mem.writeInt(u32, &bytes, n, .big);
        try t.expectEqual(n, (try gamma.parse(&bytes)).scaled);
    }
    for ([_]u32{ 0x80000000, 0xffffffff }) |n| {
        std.mem.writeInt(u32, &bytes, n, .big);
        try t.expectError(error.InvalidPngColorInteger, gamma.parse(&bytes));
    }
    for (0..4) |len| try t.expectError(error.InvalidPngGammaSize, gamma.parse(bytes[0..len]));
    try t.expectError(error.InvalidPngGammaSize, gamma.parse(&.{ 0, 0, 0, 0, 0 }));
    var raw: [32]u8 = @splat(0);
    const values = [_]u32{ 31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000 };
    for (values, 0..) |v, i| std.mem.writeInt(u32, raw[i * 4 ..][0..4], v, .big);
    const c = try chroma.parse(&raw);
    try t.expectEqualDeep(chroma.Value{ .white = .{ .x = 31270, .y = 32900 }, .red = .{ .x = 64000, .y = 33000 }, .green = .{ .x = 30000, .y = 60000 }, .blue = .{ .x = 15000, .y = 6000 } }, c);
    for (0..8) |i| {
        var bad = raw;
        std.mem.writeInt(u32, bad[i * 4 ..][0..4], 0x80000000, .big);
        try t.expectError(error.InvalidPngColorInteger, chroma.parse(&bad));
    }
    for (0..32) |len| try t.expectError(error.InvalidPngChromaticitiesSize, chroma.parse(raw[0..len]));
    try t.expectError(error.InvalidPngChromaticitiesSize, chroma.parse(&(raw ++ [_]u8{0})));
}
fn allocations(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const r = try pixels.inspect(a, good, .{});
    try t.expectEqual(@as(u32, 0), r.gamma.?.scaled);
    try t.expect(r.chromaticities != null and r.color_semantics_deferred);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngColorInteger, err),
    }
}
test "PNG fixed color integrated allocation cleanup and explicit interpretation deferral" {
    const f = @import("pixels_fixture.zig");
    const good = try f.withEarlyMetadata(t.allocator, 0, &.{ .{ .name = "gAMA", .bytes = &.{ 0, 0, 0, 0 } }, .{ .name = "cHRM", .bytes = &([_]u8{0} ** 32) } });
    defer t.allocator.free(good);
    const bad = try f.withEarlyMetadata(t.allocator, 0, &.{.{ .name = "gAMA", .bytes = &.{ 0x80, 0, 0, 0 } }});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocations, .{ good, bad });
}
test "PNG fixed color metadata order duplicates and failed state preservation" {
    const State = @import("metadata.zig").State;
    const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
    const Chunk = @import("chunks.zig").Chunk;
    const g: Chunk = .{ .name = "gAMA".*, .payload = &.{ 0, 0, 0, 0 }, .raw = &.{} };
    const c: Chunk = .{ .name = "cHRM".*, .payload = &([_]u8{0} ** 32), .raw = &.{} };
    var s: State = .{};
    try s.consume(h, 0, g);
    try s.consume(h, 0, c);
    const before = s;
    try t.expectError(error.DuplicatePngGamma, s.consume(h, 0, g));
    try t.expectError(error.DuplicatePngChromaticities, s.consume(h, 0, c));
    try t.expectEqualDeep(before, s);
    for ([_]bool{ false, true }) |palette_seen| {
        var ordered: State = .{ .palette_seen = palette_seen, .data_seen = !palette_seen };
        try t.expectError(error.InvalidPngGammaOrder, ordered.consume(h, 0, g));
        try t.expectError(error.InvalidPngChromaticitiesOrder, ordered.consume(h, 0, c));
        try t.expect(ordered.gamma == null and ordered.chromaticities == null);
    }
    var malformed: State = .{};
    try t.expectError(error.InvalidPngGammaSize, malformed.consume(h, 0, .{ .name = "gAMA".*, .payload = &.{0}, .raw = &.{} }));
    try t.expectEqualDeep(State{}, malformed);
}
