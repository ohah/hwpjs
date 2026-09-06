const std = @import("std");
const t = std.testing;
const BinData = @import("bin_data.zig").BinData;
test "storage extension view is explicit and distinguishes absent from empty" {
    const raw = [_]u8{ 2, 0, 1, 0, 3, 0, 'O', 0, 'L', 0, 'E', 0, 9 };
    const item = try BinData.parse(&raw);
    const observed = (try item.target(.observed_optional_extension)).?;
    try t.expectEqual(1, observed.id);
    try t.expectEqualSlices(u8, raw[6..12], observed.extension_utf16.?);
    try t.expectEqualSlices(u8, &.{9}, observed.extra);
    try t.expectEqualSlices(u8, raw[4..], item.extra);
    const specified = (try item.target(.specified)).?;
    try t.expectEqual(null, specified.extension_utf16);
    try t.expectEqualSlices(u8, raw[4..], specified.extra);
    const absent = (try (try BinData.parse(raw[0..4])).target(.observed_optional_extension)).?;
    try t.expectEqual(null, absent.extension_utf16);
    const empty = (try (try BinData.parse(&.{ 2, 0, 0, 0, 0, 0 })).target(.observed_optional_extension)).?;
    try t.expectEqual(0, empty.extension_utf16.?.len);
    try t.expectEqual(0, empty.id);
    for (5..12) |n| try t.expectError(error.UnexpectedEnd, (try BinData.parse(raw[0..n])).target(.observed_optional_extension));
    const embedded = (try (try BinData.parse(&.{ 1, 0, 255, 255, 0, 0, 8 })).target(.specified)).?;
    try t.expectEqual(65535, embedded.id);
    try t.expectEqualSlices(u8, &.{8}, embedded.extra);
    try t.expectEqual(null, try (try BinData.parse(&.{ 0, 0, 0, 0, 0, 0 })).target(.specified));
    try t.expectEqual(null, try (try BinData.parse(&.{ 15, 0 })).target(.observed_optional_extension));
}
