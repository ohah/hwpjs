const std = @import("std");
const t = std.testing;
const srgb = @import("srgb.zig");
const State = @import("metadata.zig").State;
const Chunk = @import("chunks.zig").Chunk;
const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
fn chunk(name: *const [4]u8, bytes: []const u8) Chunk {
    return .{ .name = name.*, .payload = bytes, .raw = &.{} };
}
test "PNG sRGB exhaustive intents and optional exact companion values" {
    for (0..256) |i| {
        const bytes = [_]u8{@intCast(i)};
        if (i < 4) try t.expectEqual(i, @intFromEnum(try srgb.parse(&bytes))) else try t.expectError(error.InvalidPngSrgbIntent, srgb.parse(&bytes));
    }
    try t.expectError(error.InvalidPngSrgbSize, srgb.parse(&.{}));
    try t.expectError(error.InvalidPngSrgbSize, srgb.parse(&.{ 0, 0 }));
    try srgb.validate(null, null);
    try srgb.validate(.{ .scaled = 45455 }, .{ .white = .{ .x = 31270, .y = 32900 }, .red = .{ .x = 64000, .y = 33000 }, .green = .{ .x = 30000, .y = 60000 }, .blue = .{ .x = 15000, .y = 6000 } });
    try t.expectError(error.InvalidPngSrgbGamma, srgb.validate(.{ .scaled = 45454 }, null));
    var wrong = srgb.canonical_chromaticities;
    wrong.blue.y += 1;
    try t.expectError(error.InvalidPngSrgbChromaticities, srgb.validate(null, wrong));
}
test "PNG sRGB atomic cross-check in both arrival orders and duplicate zero intent" {
    const s = chunk("sRGB", &.{0});
    const bad_g = chunk("gAMA", &.{ 0, 0, 0, 0 });
    const bad_c = chunk("cHRM", &([_]u8{0} ** 32));
    for ([_]Chunk{ bad_g, bad_c }, [_]anyerror{ error.InvalidPngSrgbGamma, error.InvalidPngSrgbChromaticities }) |bad, err| {
        var first: State = .{};
        try first.consume(h, 0, s);
        const before = first;
        try t.expectError(err, first.consume(h, 0, bad));
        try t.expectEqualDeep(before, first);
        var last: State = .{};
        try last.consume(h, 0, bad);
        const previous = last;
        try t.expectError(err, last.consume(h, 0, s));
        try t.expectEqualDeep(previous, last);
    }
    var state: State = .{};
    try state.consume(h, 0, s);
    try t.expect(state.gamma == null and state.chromaticities == null);
    const before = state;
    try t.expectError(error.DuplicatePngSrgb, state.consume(h, 0, s));
    try t.expectEqualDeep(before, state);
    for ([_]bool{ false, true }) |palette| {
        var ordered: State = .{ .palette_seen = palette, .data_seen = !palette };
        const original = ordered;
        try t.expectError(error.InvalidPngSrgbOrder, ordered.consume(h, 0, s));
        try t.expectEqualDeep(original, ordered);
    }
}
fn allocations(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const r = try pixels.inspect(a, good, .{});
    try t.expectEqual(srgb.Intent.perceptual, r.srgb.?);
    try t.expect(r.gamma == null and r.chromaticities == null and r.color_semantics_deferred);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngSrgbGamma, err),
    }
}
test "PNG sRGB integrated allocation cleanup and no synthesized companions" {
    const f = @import("pixels_fixture.zig");
    const good = try f.withEarlyMetadata(t.allocator, 0, &.{.{ .name = "sRGB", .bytes = &.{0} }});
    defer t.allocator.free(good);
    const bad = try f.withEarlyMetadata(t.allocator, 0, &.{ .{ .name = "gAMA", .bytes = &.{ 0, 0, 0, 0 } }, .{ .name = "sRGB", .bytes = &.{0} } });
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocations, .{ good, bad });
}
