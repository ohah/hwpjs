const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;

fn scalar(payload: []const u8) !u16 {
    var r: Reader = .{ .bytes = payload };
    const value = std.mem.readInt(u16, (try r.take(2))[0..2], .big);
    if (r.offset != payload.len) return error.InvalidJpegScanFieldLength;
    return value;
}
/// Marker payload only: Lr=4 includes the length word itself.
pub fn restartInterval(payload: []const u8) !u16 {
    return scalar(payload);
}
/// DNL may redefine a nonzero SOF height. MCU-row agreement is a decoder check.
pub fn numberOfLines(payload: []const u8) !u16 {
    const lines = try scalar(payload);
    if (lines == 0) return error.InvalidJpegNumberOfLines;
    return lines;
}
