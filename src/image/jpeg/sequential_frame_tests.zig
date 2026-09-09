const std = @import("std");
const t = std.testing;
const frame_parser = @import("frame.zig");
const scan_parser = @import("scan.zig");
const Coverage = @import("sequential_coverage.zig").State;
const Decoder = @import("sequential_frame.zig").Decoder;

const frame = [_]u8{ 8, 0, 1, 0, 1, 3, 9, 17, 0, 4, 17, 0, 7, 17, 0 };
const q = [_]u8{0} ++ [_]u8{1} ** 64;
const h = [_]u8{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
fn segment(out: *std.ArrayList(u8), code: u8, payload: []const u8) !void {
    var prefix = [_]u8{ 255, code, 0, 0 };
    std.mem.writeInt(u16, prefix[2..4], @intCast(payload.len + 2), .big);
    try out.appendSlice(t.allocator, &prefix);
    try out.appendSlice(t.allocator, payload);
}
fn start(out: *std.ArrayList(u8), f: []const u8) !void {
    try out.appendSlice(t.allocator, &.{ 255, 216 });
    try segment(out, 0xdb, &q);
    try segment(out, 0xc4, &h);
    try segment(out, 0xc0, f);
}
fn one(out: *std.ArrayList(u8), id: u8, bits: u8) !void {
    try segment(out, 0xda, &.{ 1, id, 0, 0, 63, 0 });
    try out.append(t.allocator, bits);
}

test "JPEG sequential coverage permits reordered scans and rolls back overlapping subsets" {
    const f = try frame_parser.parse(0xc0, &frame, .{});
    var state = try Coverage.init(f);
    try state.accept(try scan_parser.parse(&.{ 1, 7, 0, 0, 63, 0 }, f));
    const before = state;
    try t.expectError(error.DuplicateJpegComponentScan, state.accept(try scan_parser.parse(&.{ 2, 9, 0, 7, 0, 0, 63, 0 }, f)));
    try t.expectEqualDeep(before, state);
    try t.expectError(error.MissingJpegComponentScan, state.finish());
    try state.accept(try scan_parser.parse(&.{ 2, 9, 0, 4, 0, 0, 63, 0 }, f));
    try state.finish();
    try t.expectEqual(@as(usize, 2), state.scans);
}

test "JPEG sequential coverage supports all 255 frame components without ID indexing" {
    var bytes: [6 + 255 * 3]u8 = @splat(0);
    @memcpy(bytes[0..6], &[_]u8{ 8, 0, 1, 0, 1, 255 });
    for (0..255) |i| {
        bytes[6 + i * 3] = @intCast(254 - i);
        bytes[7 + i * 3] = 17;
    }
    const f = try frame_parser.parse(0xc1, &bytes, .{});
    var state = try Coverage.init(f);
    for (0..255) |id| try state.accept(try scan_parser.parse(&.{ 1, @intCast(id), 0, 0, 63, 0 }, f));
    try state.finish();
    try t.expectEqual(@as(usize, 255), state.covered);
    try t.expectEqual(@as(usize, 255), state.scans);
    try t.expectError(error.UnsupportedJpegSequentialCoverage, Coverage.init(try frame_parser.parse(0xc2, &frame, .{})));
}

test "JPEG sequential frame commits completed scans and resets predictions between scans" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try start(&bytes, &frame);
    for ([_]u8{ 7, 9, 4 }) |id| try one(&bytes, id, 0x5f);
    try bytes.appendSlice(t.allocator, &.{ 255, 217 });
    var decoder = try Decoder.init(bytes.items, .{});
    for ([_]u8{ 7, 9, 4 }, 0..) |id, i| {
        const block = (try decoder.next()).?;
        try t.expectEqual(id, block.component_id);
        try t.expectEqual(@as(i32, 1), block.values[0]);
        try t.expectEqual(i, decoder.coverage.?.covered);
    }
    try t.expect(!decoder.complete);
    try t.expect(try decoder.next() == null);
    try t.expect(decoder.complete);
    try t.expectEqual(@as(usize, 3), decoder.coverage.?.covered);
    try t.expectEqual(@as(usize, 3), decoder.blocks);
    try t.expect(try decoder.next() == null);
}

test "JPEG sequential frame rejects missing duplicate and corrupt scans without partial commit" {
    for ([_]u8{ 0, 1, 2 }) |mode| {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(t.allocator);
        try start(&bytes, &frame);
        try one(&bytes, 9, if (mode == 2) 0x40 else 0x5f);
        if (mode == 1) try one(&bytes, 9, 0x5f);
        try bytes.appendSlice(t.allocator, &.{ 255, 217 });
        var decoder = try Decoder.init(bytes.items, .{});
        _ = try decoder.next();
        const offset = decoder.markers.reader.offset;
        const expected = switch (mode) {
            0 => error.MissingJpegComponentScan,
            1 => error.DuplicateJpegComponentScan,
            else => error.InvalidJpegEntropyPadding,
        };
        try t.expectError(expected, decoder.next());
        try t.expectEqual(@as(usize, 0), decoder.coverage.?.covered);
        try t.expectEqual(offset, decoder.markers.reader.offset);
        try t.expect(!decoder.complete);
    }
}

test "JPEG sequential frame resolves DNL and applies a global block budget across scans" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    var deferred = frame;
    deferred[2] = 0;
    try start(&bytes, &deferred);
    try one(&bytes, 9, 0x5f);
    try segment(&bytes, 0xdc, &.{ 0, 1 });
    try one(&bytes, 4, 0x5f);
    try one(&bytes, 7, 0x5f);
    try bytes.appendSlice(t.allocator, &.{ 255, 217 });
    var valid = try Decoder.init(bytes.items, .{});
    while (try valid.next()) |_| {}
    try t.expect(valid.complete);
    try t.expectEqual(@as(u16, 0), valid.boundaries.header_height);
    try t.expectEqual(@as(u16, 1), valid.boundaries.effective_height);
    var limited = try Decoder.init(bytes.items, .{ .max_blocks = 2 });
    _ = try limited.next();
    _ = try limited.next();
    try t.expectError(error.LimitExceeded, limited.next());
    try t.expectEqual(@as(usize, 2), limited.blocks);
    try t.expectEqual(@as(usize, 1), limited.coverage.?.covered);
}
