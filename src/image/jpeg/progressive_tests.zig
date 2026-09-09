const std = @import("std");
const t = std.testing;
const State = @import("progressive.zig").State;
const frame_parser = @import("frame.zig");
const q = .{0} ++ [_]u8{1} ** 64;
const changed_q = .{0} ++ [_]u8{2} ** 64;
const dc = .{ 0, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const ac = .{ 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const frame_bytes = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 17, 0 };
fn state() !State {
    var s = try State.init(try frame_parser.parse(0xc2, &frame_bytes, .{}), .{});
    try s.installQuantization(&q, .{});
    try s.installHuffman(&(dc ++ ac), .{});
    return s;
}
fn scan(id: u8, first: u8, last: u8, high: u8, low: u8) [6]u8 {
    return .{ 1, id, 0, first, last, high * 16 + low };
}

test "JPEG progressive every coefficient and previous approximation level matrix" {
    for (0..14) |initial| for (0..64) |coefficient| {
        var base = try state();
        _ = try base.accept(&scan(9, 0, 0, 0, @intCast(initial)));
        if (coefficient != 0) _ = try base.accept(&scan(9, @intCast(coefficient), @intCast(coefficient), 0, @intCast(initial)));
        for (1..14) |high| {
            var next = base;
            const payload = scan(9, @intCast(coefficient), @intCast(coefficient), @intCast(high), @intCast(high - 1));
            if (high == initial) {
                _ = try next.accept(&payload);
                try t.expectEqual(@as(u8, @intCast(high - 1)), next.history.levels[0][coefficient]);
            } else {
                try t.expectError(error.InvalidJpegProgression, next.accept(&payload));
                try t.expectEqualDeep(base.history, next.history);
                try t.expectEqual(base.scans, next.scans);
            }
        }
    };
}

test "JPEG progressive arbitrary band order split merge and mixed history rollback" {
    var s = try state();
    try t.expectError(error.MissingJpegInitialDcScan, s.accept(&scan(9, 50, 63, 0, 1)));
    try t.expectError(error.InvalidJpegProgression, s.accept(&scan(9, 0, 0, 1, 0)));
    _ = try s.accept(&scan(9, 0, 0, 0, 0));
    _ = try s.accept(&scan(9, 11, 63, 0, 1));
    _ = try s.accept(&scan(9, 1, 10, 0, 2));
    const before = s;
    try t.expectError(error.InvalidJpegProgression, s.accept(&scan(9, 1, 63, 2, 1)));
    try t.expectEqualDeep(before.history, s.history);
    try t.expectEqual(before.scans, s.scans);
    try t.expectError(error.DuplicateJpegInitialBand, s.accept(&scan(9, 1, 63, 0, 0)));
    _ = try s.accept(&scan(9, 1, 5, 2, 1));
    _ = try s.accept(&scan(9, 6, 10, 2, 1));
    _ = try s.accept(&scan(9, 1, 63, 1, 0));
    try t.expectEqual(@as(usize, 64), s.report().full_coefficients);
    try t.expectEqual(@as(usize, 0), s.report().unseen_coefficients);
}

test "JPEG progressive quantization changed then restored stays altered between scans" {
    var s = try state();
    _ = try s.accept(&scan(9, 0, 0, 0, 2));
    try s.installQuantization(&q, .{});
    _ = try s.accept(&scan(9, 0, 0, 2, 1));
    const before = s;
    const malformed = changed_q ++ .{0};
    try t.expectError(error.UnexpectedEnd, s.installQuantization(&malformed, .{}));
    try t.expectEqualDeep(before.altered_since_scan, s.altered_since_scan);
    try t.expect(before.tables.quantization[0].?.raw.ptr == s.tables.quantization[0].?.raw.ptr);
    try s.installQuantization(&(changed_q ++ q), .{});
    try t.expectEqual(@as(u16, 1), s.tables.quantization[0].?.value(0).?);
    try t.expectError(error.AlteredJpegProgressiveQuantization, s.accept(&scan(9, 0, 0, 1, 0)));
    try t.expectEqual(before.scans, s.scans);
}

test "JPEG progressive shared quantization changes only constrain previously scanned components" {
    const bytes = [_]u8{ 8, 0, 1, 0, 1, 2, 9, 17, 0, 4, 17, 0 };
    var s = try State.init(try frame_parser.parse(0xc2, &bytes, .{}), .{});
    try s.installQuantization(&q, .{});
    try s.installHuffman(&(dc ++ ac), .{});
    _ = try s.accept(&scan(9, 0, 0, 0, 1));
    try s.installQuantization(&changed_q, .{});
    // A later component may use this destination after the first component's last scan.
    _ = try s.accept(&scan(4, 0, 0, 0, 1));
    _ = try s.accept(&scan(4, 0, 0, 1, 0));
    try t.expectError(error.AlteredJpegProgressiveQuantization, s.accept(&scan(9, 0, 0, 1, 0)));
    try t.expectEqual(@as(usize, 126), s.report().unseen_coefficients);
}

test "JPEG progressive multicomponent failure preserves earlier component and scan budget" {
    const bytes = [_]u8{ 8, 0, 1, 0, 1, 2, 9, 17, 0, 4, 17, 0 };
    var s = try State.init(try frame_parser.parse(0xc2, &bytes, .{}), .{ .max_scans = 1 });
    try s.installQuantization(&q, .{});
    try s.installHuffman(&dc, .{});
    _ = try s.accept(&scan(4, 0, 0, 0, 1));
    const multi = [_]u8{ 2, 9, 0, 4, 0, 0, 0, 1 };
    try t.expectError(error.LimitExceeded, s.accept(&multi));
    s.options.max_scans = 2;
    try t.expectError(error.DuplicateJpegInitialBand, s.accept(&multi));
    try t.expectEqual(@as(u8, 255), s.history.levels[0][0]);
    try t.expectEqual(@as(usize, 1), s.scans);
    _ = try s.accept(&scan(9, 0, 0, 0, 2));
    try t.expectEqual(@as(usize, 2), s.report().partial_coefficients);
}

test "JPEG progressive context rejects other processes and preserves unused Q destinations" {
    try t.expectError(error.UnsupportedJpegProgressionProcess, State.init(try frame_parser.parse(0xc0, &frame_bytes, .{}), .{}));
    try t.expectError(error.UnsupportedJpegArithmeticTables, State.init(try frame_parser.parse(0xca, &frame_bytes, .{}), .{}));
    var s = try state();
    _ = try s.accept(&scan(9, 0, 0, 0, 1));
    const other = (.{3} ++ [_]u8{1} ** 64) ++ (.{3} ++ [_]u8{2} ** 64);
    try s.installQuantization(&other, .{});
    _ = try s.accept(&scan(9, 0, 0, 1, 0));
    try t.expectEqual(@as(usize, 63), s.report().unseen_coefficients);
}
