const std = @import("std");
const t = std.testing;
const keyword = @import("keyword.zig");
const text = @import("text.zig");
test "PNG text keyword byte matrix positions and size bounds" {
    for (0..3) |position| for (0..256) |value| {
        var bytes = [_]u8{ 'A', 'B', 'C' };
        bytes[position] = @intCast(value);
        const character = (value >= 32 and value <= 126) or value >= 161;
        const valid = character and (value != 32 or position == 1);
        if (valid) try keyword.validate(&bytes) else if (keyword.validate(&bytes)) |_| return error.ExpectedFailure else |_| {}
    };
    var bytes: [81]u8 = @splat('A');
    for (0..81) |len| {
        if (len >= 1 and len <= 79) try keyword.validate(bytes[0..len]) else try t.expectError(error.InvalidPngKeywordSize, keyword.validate(bytes[0..len]));
    }
    try t.expectError(error.InvalidPngKeywordSpace, keyword.validate("A  B"));
    bytes[79] = 0;
    try t.expectEqual(@as(usize, 79), (try keyword.split(&bytes)).keyword.len);
    bytes[79] = 'A';
    bytes[80] = 0;
    try t.expectError(error.MissingPngKeywordSeparator, keyword.split(&bytes));
}
test "PNG text every body byte and borrowed exact preservation" {
    for (0..256) |value| {
        const bytes = [_]u8{ 'K', 0, @intCast(value) };
        if (value == 10 or (value >= 32 and value <= 126) or value >= 160) {
            const parsed = try text.parse(&bytes);
            try t.expectEqual(value, parsed.text[0]);
        } else if (value == 0) try t.expectError(error.InvalidPngTextNull, text.parse(&bytes)) else try t.expectError(error.UnsupportedPngTextCharacter, text.parse(&bytes));
    }
    var bytes = [_]u8{ 'T', 0, 160, 255, 10, 32 };
    const parsed = try text.parse(&bytes);
    try t.expectEqual(@intFromPtr(&bytes[0]), @intFromPtr(parsed.keyword.ptr));
    try t.expectEqual(@intFromPtr(&bytes[2]), @intFromPtr(parsed.text.ptr));
    try t.expectEqualSlices(u8, bytes[2..], parsed.text);
    try t.expectEqual(@as(usize, 0), (try text.parse("K\x00")).text.len);
    try t.expectError(error.MissingPngKeywordSeparator, text.parse("K"));
    try t.expectError(error.InvalidPngKeywordSize, text.parse("\x00T"));
}
test "PNG text repeated keyword after IDAT and failed state atomicity" {
    var state: @import("metadata.zig").State = .{};
    const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
    try state.consume(h, 0, .{ .name = "IDAT".*, .payload = &.{}, .raw = &.{} });
    for (0..2) |_| try state.consume(h, 0, .{ .name = "tEXt".*, .payload = "K\x00", .raw = &.{} });
    try t.expectEqual(@as(usize, 2), state.text_chunks);
    try t.expectEqual(@as(usize, 2), state.text_keyword_bytes);
    try t.expectEqual(@as(usize, 0), state.text_bytes);
    const saved = state;
    try t.expectError(error.InvalidPngTextNull, state.consume(h, 0, .{ .name = "tEXt".*, .payload = "K\x00T\x00", .raw = &.{} }));
    try t.expectEqualDeep(saved, state);
}
fn allocation(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const report = try pixels.inspect(a, good, .{});
    try t.expectEqual(@as(usize, 2), report.text_chunks);
    try t.expectEqual(@as(usize, 0), report.structure.ancillary_chunks_deferred);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngTextNull, err),
    }
}
test "PNG text integrated allocation failure cleanup" {
    const fixture = @import("pixels_fixture.zig");
    const good = try fixture.withMetadata(t.allocator, 0, &.{ .{ .name = "tEXt", .bytes = "K\x00" }, .{ .name = "tEXt", .bytes = "K\x00V" } });
    defer t.allocator.free(good);
    const bad = try fixture.withMetadata(t.allocator, 0, &.{.{ .name = "tEXt", .bytes = "K\x00V\x00" }});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocation, .{ good, bad });
}
