const t = @import("std").testing;
const View = @import("last_document.zig").View;
test "observed last document is one borrowed raw UTF16 record without XML normalization" {
    const raw = [_]u8{ 49, 4, 0, 0, 0, 0, 0xd8, 0, 0 };
    const v = try View.parseObserved(&raw, .{ .max_records = 1, .max_payload_bytes = 4 });
    try t.expect(v.raw.ptr == &raw);
    try t.expect(v.text.ptr == raw[5..].ptr);
    try t.expectEqualSlices(u8, raw[5..], v.text);
    try t.expectEqual(2, v.report.text_units);
    try t.expectError(error.LimitExceeded, View.parseObserved(&raw, .{ .max_records = 0 }));
    try t.expectError(error.LimitExceeded, View.parseObserved(&raw, .{ .max_payload_bytes = 3 }));
    try t.expectError(error.MissingHistoryLastDocument, View.parseObserved(&.{}, .{}));
    for (1..raw.len) |n| try t.expectError(error.UnexpectedEnd, View.parseObserved(raw[0..n], .{}));
    try t.expectError(error.InvalidHistoryTextSize, View.parseObserved(&.{ 49, 1, 0, 0, 0, 0 }, .{}));
    try t.expectError(error.InvalidHistoryLastDocumentTag, View.parseObserved(&.{ 16, 0, 0, 0, 0 }, .{}));
    try t.expectError(error.ExtraHistoryLastDocumentRecord, View.parseObserved(&.{ 49, 0, 0, 0, 0, 49, 0, 0, 0, 0 }, .{}));
}
