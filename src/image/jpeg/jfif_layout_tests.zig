const std = @import("std");
const t = std.testing;
const layout = @import("jfif_layout.zig");

const soi = [_]u8{ 255, 216 };
const header = [_]u8{ 255, 224, 0, 16 } ++ "JFIF\x00".* ++ .{ 1, 2, 0, 0, 1, 0, 1, 0, 0 };
const rest = [_]u8{ 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 127, 255, 217 };
const unknown = [_]u8{ 255, 224, 0, 8 } ++ "JFXX\x00\xff".*;
const compressed = [_]u8{ 255, 224, 0, 8 } ++ "JFXX\x00\x10".*;
const app = [_]u8{ 255, 224, 0, 7 } ++ "acme\x00".*;

test "JPEG JFIF layout counts adjacent extensions and borrows header" {
    const bytes = soi ++ header ++ unknown ++ compressed ++ unknown ++ app ++ rest;
    const result = try layout.inspect(&bytes, .{});
    try t.expectEqual(@as(usize, 3), result.extensions);
    try t.expectEqual(@as(usize, 2), result.unknown_extensions);
    try t.expectEqual(@as(usize, 1), result.compressed_thumbnails_unchecked);
    try t.expectEqual(@as(usize, 1), result.application_markers);
    try t.expectEqual(@as(u16, 258), result.header.version);
    try t.expectEqual(@intFromPtr(bytes[20..].ptr), @intFromPtr(result.header.thumbnail_rgb.ptr));
    try t.expect(result.structure.semantics_deferred);
    // JPEG marker fill does not introduce a different intervening marker.
    _ = try layout.inspect(&(soi ++ .{255} ++ header ++ .{255} ++ unknown ++ rest), .{});
}

test "JPEG JFIF layout rejects displaced duplicate and interrupted extensions" {
    try t.expectError(error.MissingJfifHeader, layout.inspect(&(soi ++ rest), .{}));
    try t.expectError(error.MissingJfifHeader, layout.inspect(&(soi ++ app ++ header ++ rest), .{}));
    try t.expectError(error.MissingJfifHeader, layout.inspect(&(soi ++ unknown ++ header ++ rest), .{}));
    for ([_]usize{ 0, 13, 24 }) |at| {
        // Before SOF, before SOS, and after entropy immediately before EOI.
        var duplicate: [soi.len + 2 * header.len + rest.len]u8 = undefined;
        @memcpy(duplicate[0..2], &soi);
        @memcpy(duplicate[2..][0..header.len], &header);
        @memcpy(duplicate[2 + header.len ..][0..at], rest[0..at]);
        @memcpy(duplicate[2 + header.len + at ..][0..header.len], &header);
        @memcpy(duplicate[2 + 2 * header.len + at ..], rest[at..]);
        try t.expectError(error.DuplicateJfifHeader, layout.inspect(&duplicate, .{}));
    }
    try t.expectError(error.InvalidJfxxPosition, layout.inspect(&(soi ++ header ++ unknown ++ app ++ unknown ++ rest), .{}));
    try t.expectError(error.InvalidJfxxPosition, layout.inspect(&(soi ++ header ++ rest[0..24].* ++ unknown ++ rest[24..].*), .{}));
}

test "JPEG JFIF layout keeps payload frame and structural failure boundaries" {
    const bad_app = [_]u8{ 255, 224, 0, 6 } ++ "acme".*;
    try t.expectError(error.UnterminatedJfifApplicationId, layout.inspect(&(soi ++ header ++ bad_app ++ rest), .{}));
    // Other APPn contents are opaque, not subject to APP0 identifier syntax.
    var other = bad_app;
    for (225..240) |code| {
        other[1] = @intCast(code);
        const result = try layout.inspect(&(soi ++ header ++ other ++ rest), .{});
        try t.expectEqual(@as(usize, 1), result.application_markers);
    }
    var bad_frame = rest;
    bad_frame[10] = 9;
    try t.expectError(error.InvalidJfifComponentId, layout.inspect(&(soi ++ header ++ bad_frame), .{}));
    const raw = soi ++ header ++ rest;
    for (0..raw.len) |n| {
        if (layout.inspect(raw[0..n], .{})) |_| return error.UnexpectedValidTruncation else |_| {}
    }
    try t.expectError(error.LimitExceeded, layout.inspect(&raw, .{ .markers = .{ .max_markers = 4 } }));
    try t.expectError(error.TrailingJpegBytes, layout.inspect(&(raw ++ .{0}), .{}));
    try t.expectEqual(@as(usize, 1), (try layout.inspect(&(raw ++ .{0}), .{ .allow_trailing_bytes = true })).structure.trailing_bytes);
    var invalid_extension = unknown;
    invalid_extension[9] = 19;
    try t.expectError(error.UnexpectedEnd, layout.inspect(&(soi ++ header ++ invalid_extension ++ rest), .{}));
}
