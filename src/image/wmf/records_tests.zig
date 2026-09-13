const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const header_types = @import("header.zig");

fn header(max: u32) header_types.Header {
    return .{
        .placeable = undefined,
        .meta = .{ .metafile_type = .memory, .version = .version_300, .size_words = 0, .number_of_objects = 0, .max_record_words = max, .number_of_members = 0 },
        .records_offset = 0,
    };
}

const valid = [_]u8{
    4, 0, 0, 0, 0x2d, 1, 0xaa, 0xbb,
    3, 0, 0, 0, 0,    0,
};

test "WMF records require exact framing max size and terminal EOF" {
    const summary = try records.validate(&valid, header(4), .{});
    try t.expectEqual(@as(usize, 2), summary.count);
    try t.expectEqual(@as(u32, 4), summary.max_record_words);
    try t.expectEqual(valid.len, summary.eof_end);
    try t.expectError(error.InvalidWmfMaxRecord, records.validate(&valid, header(3), .{}));
    try t.expectError(error.TruncatedWmfRecord, records.validate(valid[0 .. valid.len - 1], header(4), .{}));
}

test "WMF records reject invalid size EOF and post-EOF data" {
    const undersized_eof = [_]u8{ 2, 0, 0, 0, 0, 0 };
    try t.expectError(error.InvalidWmfRecordSize, records.validate(&undersized_eof, header(2), .{}));
    var bytes = valid;
    bytes[0] = 2;
    try t.expectError(error.InvalidWmfRecordSize, records.validate(&bytes, header(4), .{}));
    bytes = valid;
    bytes[8] = 4;
    try t.expectError(error.TruncatedWmfRecord, records.validate(&bytes, header(4), .{}));
    bytes = valid;
    bytes[12] = 1;
    try t.expectError(error.MissingWmfEof, records.validate(&bytes, header(4), .{}));
    const post = valid ++ [_]u8{ 3, 0, 0, 0, 1, 0 };
    try t.expectError(error.DataAfterWmfEof, records.validate(&post, header(4), .{}));
}

test "WMF trailing zero words are exact and explicit" {
    const padded = valid ++ [_]u8{ 0, 0, 0, 0 };
    try t.expectError(error.DataAfterWmfEof, records.validate(&padded, header(4), .{}));
    const summary = try records.validate(&padded, header(4), .{ .trailing_zero_words = 2 });
    try t.expectEqual(@as(usize, 2), summary.trailing_zero_words);
    try t.expectError(error.TruncatedWmfRecord, records.validate(&padded, header(4), .{ .trailing_zero_words = 3 }));
    var nonzero = padded;
    nonzero[nonzero.len - 1] = 1;
    try t.expectError(error.InvalidWmfTrailingData, records.validate(&nonzero, header(4), .{ .trailing_zero_words = 2 }));
}
