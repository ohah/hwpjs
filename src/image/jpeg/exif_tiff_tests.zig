const std = @import("std");
const exif = @import("exif_tiff.zig");

const little = "Exif\x00\x00".* ++ "II".* ++ .{ 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0 };
const big = "Exif\x00\x00".* ++ "MM".* ++ .{ 0, 42, 0, 0, 0, 8, 0, 1, 1, 0x12, 0, 3, 0, 0, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0 };

test "JPEG Exif TIFF reads primary orientation in both byte orders" {
    const le = try exif.inspect(&little, .{});
    try std.testing.expectEqual(.little, le.byte_order);
    try std.testing.expectEqual(@as(?u8, 6), le.orientation);
    try std.testing.expectEqual(@as(usize, 1), le.fields);
    try std.testing.expect(!le.nested_ifds_deferred);
    const be = try exif.inspect(&big, .{});
    try std.testing.expectEqual(.big, be.byte_order);
    try std.testing.expectEqual(@as(?u8, 8), be.orientation);
}

test "JPEG Exif TIFF selects only the first marker after SOI" {
    const app1 = [_]u8{ 255, 225, 0, 34 } ++ little;
    const first = [_]u8{ 255, 216 } ++ app1;
    try std.testing.expectEqual(@as(?u8, 6), (try exif.inspectFirst(&first, .{}, .{})).?.orientation);
    const later = [_]u8{ 255, 216, 255, 224, 0, 2 } ++ app1;
    try std.testing.expectEqual(@as(?exif.Report, null), try exif.inspectFirst(&later, .{}, .{}));
    try std.testing.expectError(error.MissingJpegSoi, exif.inspectFirst(&app1, .{}, .{}));
    try std.testing.expectError(error.LimitExceeded, exif.inspectFirst(&first, .{ .max_payload_bytes = 0 }, .{}));
}

test "JPEG Exif TIFF reports bounds, deferred nested content, and bad orientation" {
    try std.testing.expectError(error.InvalidExifIdentifier, exif.inspect("Exif\x00", .{}));
    for (0..little.len) |length| {
        if (exif.inspect(little[0..length], .{})) |_| return error.ExpectedExifFailure else |_| {}
    }
    var invalid = little;
    invalid[24] = 9;
    try std.testing.expectError(error.InvalidExifOrientation, exif.inspect(&invalid, .{}));
    invalid[24] = 0;
    try std.testing.expectError(error.InvalidExifOrientation, exif.inspect(&invalid, .{}));
    invalid = little;
    invalid[18] = 4;
    try std.testing.expectError(error.InvalidExifOrientation, exif.inspect(&invalid, .{}));
    invalid = little;
    invalid[20] = 2;
    try std.testing.expectError(error.InvalidExifOrientation, exif.inspect(&invalid, .{}));
    try std.testing.expectError(error.LimitExceeded, exif.inspect(&little, .{ .max_fields = 0 }));

    const nested = "Exif\x00\x00".* ++ "II".* ++ .{ 42, 0, 8, 0, 0, 0, 2, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0x69, 0x87, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    const checked = try exif.inspect(&nested, .{});
    try std.testing.expect(checked.nested_ifds_deferred);
    var unsorted = nested;
    const first_entry = unsorted[16..28].*;
    const second_entry = unsorted[28..40].*;
    @memcpy(unsorted[16..28], &second_entry);
    @memcpy(unsorted[28..40], &first_entry);
    const reordered = try exif.inspect(&unsorted, .{});
    try std.testing.expectEqual(@as(?u8, 6), reordered.orientation);
    var deferred_thumbnail = nested;
    deferred_thumbnail[40] = 8;
    try std.testing.expect((try exif.inspect(&deferred_thumbnail, .{})).thumbnail_deferred);
    var bad_pointer = nested;
    bad_pointer[36] = 39;
    const still_borrowed = try exif.inspect(&bad_pointer, .{});
    try std.testing.expectEqual(@as(?u8, 6), still_borrowed.orientation);
    try std.testing.expect(still_borrowed.nested_ifds_deferred);
    const empty = "Exif\x00\x00".* ++ "II".* ++ .{ 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    try std.testing.expectEqual(@as(?u8, null), (try exif.inspect(&empty, .{})).orientation);
    var odd_offset = little;
    odd_offset[10] = 9;
    try std.testing.expectError(error.InvalidTiffIfdOffset, exif.inspect(&odd_offset, .{}));
    odd_offset[10] = 64;
    try std.testing.expectError(error.InvalidTiffIfdOffset, exif.inspect(&odd_offset, .{}));
    var bad_order = little;
    bad_order[6] = 'X';
    try std.testing.expectError(error.InvalidTiffByteOrder, exif.inspect(&bad_order, .{}));
    bad_order = little;
    bad_order[8] = 43;
    try std.testing.expectError(error.UnsupportedTiffVersion, exif.inspect(&bad_order, .{}));
    const duplicate = "Exif\x00\x00".* ++ "II".* ++ .{ 42, 0, 8, 0, 0, 0, 2, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0 };
    try std.testing.expectError(error.DuplicateExifOrientation, exif.inspect(&duplicate, .{}));
}
