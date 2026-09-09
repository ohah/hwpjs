const std = @import("std");
const t = std.testing;
const fields = @import("scan_fields.zig");
const Restart = @import("restarts.zig").State;
const structure = @import("structure.zig");
const soi = [_]u8{ 255, 216 };
const eoi = [_]u8{ 255, 217 };
const sof = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 2, 1, 9, 17, 0 };
const deferred_sof = [_]u8{ 255, 192, 0, 11, 8, 0, 0, 0, 2, 1, 9, 17, 0 };
const sos = [_]u8{ 255, 218, 0, 8, 1, 9, 0, 0, 63, 0 };
const data = [_]u8{ 18, 255, 0, 52 };
const dri = [_]u8{ 255, 221, 0, 4, 0, 1 };
const dnl = [_]u8{ 255, 220, 0, 4, 0, 3 };
const comment = [_]u8{ 255, 254, 0, 2 };
const basic = soi ++ sof ++ sos ++ data ++ eoi;

test "JPEG DRI and DNL all u16 values and exact payload lengths" {
    for (0..65536) |value| {
        var bytes: [2]u8 = undefined;
        std.mem.writeInt(u16, &bytes, @intCast(value), .big);
        try t.expectEqual(@as(u16, @intCast(value)), try fields.restartInterval(&bytes));
        if (value == 0) {
            try t.expectError(error.InvalidJpegNumberOfLines, fields.numberOfLines(&bytes));
        } else try t.expectEqual(@as(u16, @intCast(value)), try fields.numberOfLines(&bytes));
    }
    for (0..2) |n| {
        try t.expectError(error.UnexpectedEnd, fields.restartInterval(data[0..n]));
        try t.expectError(error.UnexpectedEnd, fields.numberOfLines(data[0..n]));
    }
    for (3..5) |n| {
        try t.expectError(error.InvalidJpegScanFieldLength, fields.restartInterval(data[0..n]));
        try t.expectError(error.InvalidJpegScanFieldLength, fields.numberOfLines(data[0..n]));
    }
}

test "JPEG restart byte matrix wraps and resets without changing interval" {
    for (0..8) |expected| for (0..256) |code| {
        var s: Restart = .{ .interval = 1, .in_scan = true, .next = @intCast(expected) };
        if (code == 208 + expected) {
            try s.accept(@intCast(code), 1);
            try t.expectEqual(@as(u3, @intCast((expected + 1) % 8)), s.next);
        } else {
            try t.expectError(error.InvalidJpegRestartSequence, s.accept(@intCast(code), 1));
            try t.expectEqual(@as(u3, @intCast(expected)), s.next);
            try t.expectEqual(@as(usize, 0), s.count);
        }
    };
    var s: Restart = .{};
    try t.expectError(error.InvalidJpegRestartPosition, s.accept(208, 10));
    try s.define(&.{ 0, 1 });
    s.beginScan();
    try t.expectError(error.InvalidJpegRestartPosition, s.define(&.{ 0, 2 }));
    try t.expectError(error.LimitExceeded, s.accept(208, 0));
    try s.accept(208, 1);
    s.endScan();
    s.beginScan();
    try s.accept(208, 2);
    s.endScan();
    try s.define(&.{ 0, 0 });
    s.beginScan();
    try t.expectError(error.InvalidJpegRestartPosition, s.accept(208, 3));
}

test "JPEG structural report preserves header height and DNL redefinition" {
    const normal = try structure.inspect(&basic, .{});
    try t.expectEqual(@as(usize, 4), normal.markers);
    try t.expectEqual(@as(usize, 4), normal.entropy_bytes);
    try t.expectEqual(@as(usize, 1), normal.stuffed_bytes);
    try t.expect(normal.semantics_deferred);
    for ([_][]const u8{ &sof, &deferred_sof }) |header| {
        const bytes = soi ++ header[0..13].* ++ sos ++ data ++ dnl ++ eoi;
        const report = try structure.inspect(&bytes, .{});
        try t.expectEqual(@as(u16, header[6]), report.header_height);
        try t.expectEqual(@as(u16, 3), report.effective_height);
        try t.expect(report.dnl_seen);
        try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .frame = .{ .max_pixels = 5 } }));
        _ = try structure.inspect(&bytes, .{ .frame = .{ .max_pixels = 6 } });
    }
}

test "JPEG DNL is mandatory for zero height and terminates only the first scan" {
    try t.expectError(error.MissingJpegDnl, structure.inspect(&(soi ++ deferred_sof ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.MissingJpegDnl, structure.inspect(&(soi ++ deferred_sof ++ sos ++ data ++ comment ++ dnl ++ eoi), .{}));
    try t.expectError(error.InvalidJpegDnlPosition, structure.inspect(&(soi ++ sof ++ dnl ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.InvalidJpegDnlPosition, structure.inspect(&(soi ++ sof ++ sos ++ data ++ dnl ++ dnl ++ eoi), .{}));
    try t.expectError(error.InvalidJpegDnlPosition, structure.inspect(&(soi ++ sof ++ sos ++ data ++ sos ++ data ++ dnl ++ eoi), .{}));
    try t.expectError(error.InvalidJpegMarker, structure.inspect(&(soi ++ sof ++ sos ++ data ++ dnl ++ data ++ eoi), .{}));
}

test "JPEG structural restart sequence scan reset disabling and limits" {
    const rst0 = [_]u8{ 255, 208 };
    const rst1 = [_]u8{ 255, 209 };
    const bytes = soi ++ dri ++ sof ++ sos ++ data ++ rst0 ++ data ++ rst1 ++ data ++ sos ++ data ++ rst0 ++ data ++ eoi;
    const report = try structure.inspect(&bytes, .{});
    try t.expectEqual(@as(usize, 3), report.restart_markers);
    try t.expectEqual(@as(usize, 2), report.scans);
    try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .max_restarts = 2 }));
    try t.expectError(error.LimitExceeded, structure.inspect(&bytes, .{ .max_scans = 1 }));
    try t.expectError(error.InvalidJpegRestartPosition, structure.inspect(&(soi ++ rst0 ++ sof ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.InvalidJpegRestartPosition, structure.inspect(&(soi ++ sof ++ sos ++ data ++ rst0 ++ data ++ eoi), .{}));
    try t.expectError(error.InvalidJpegRestartSequence, structure.inspect(&(soi ++ dri ++ sof ++ sos ++ data ++ rst1 ++ data ++ eoi), .{}));
    const disable = [_]u8{ 255, 221, 0, 4, 0, 0 };
    try t.expectError(error.InvalidJpegRestartPosition, structure.inspect(&(soi ++ dri ++ sof ++ sos ++ data ++ disable ++ sos ++ data ++ rst0 ++ data ++ eoi), .{}));
}

test "JPEG one image envelope rejects missing duplicate boundaries and explicit trailing policy" {
    try t.expectError(error.MissingJpegSoi, structure.inspect(&.{}, .{}));
    try t.expectError(error.MissingJpegSoi, structure.inspect(&(sof ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.MissingJpegFrame, structure.inspect(&(soi ++ eoi), .{}));
    try t.expectError(error.MissingJpegFrame, structure.inspect(&(soi ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.MissingJpegScan, structure.inspect(&(soi ++ sof ++ eoi), .{}));
    try t.expectError(error.DuplicateJpegSoi, structure.inspect(&(soi ++ soi ++ sof ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.DuplicateJpegFrame, structure.inspect(&(soi ++ sof ++ sof ++ sos ++ data ++ eoi), .{}));
    try t.expectError(error.TrailingJpegBytes, structure.inspect(&(basic ++ .{42}), .{}));
    try t.expectEqual(@as(usize, 1), (try structure.inspect(&(basic ++ .{42}), .{ .allow_trailing_bytes = true })).trailing_bytes);
    for (0..basic.len) |length| {
        if (structure.inspect(basic[0..length], .{})) |_| return error.ExpectedTruncationFailure else |_| {}
    }
    _ = try structure.inspect(&basic, .{ .markers = .{ .max_markers = 4 } });
    try t.expectError(error.LimitExceeded, structure.inspect(&basic, .{ .markers = .{ .max_markers = 3 } }));
}
