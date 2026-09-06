const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub fn width(code_page: u16) usize {
    return if (code_page == 1200) 2 else 1;
}
/// Shared bounds, NUL and padding; never transcodes or removes embedded NULs.
fn take(r: *Reader, units: usize, unit_width: usize, padded: bool) ![]const u8 {
    if (unit_width != 1 and unit_width != 2) return error.InvalidSummaryStringWidth;
    if (r.offset > r.bytes.len) return error.UnexpectedEnd;
    if (units > (r.bytes.len - r.offset) / unit_width) return error.UnexpectedEnd;
    const bytes = try r.take(units * unit_width);
    if (bytes.len != 0 and !std.mem.allEqual(u8, bytes[bytes.len - unit_width ..], 0)) return error.InvalidSummaryTerminator;
    if (padded and !std.mem.allEqual(u8, try r.take((4 - bytes.len % 4) % 4), 0)) return error.InvalidSummaryPadding;
    return bytes;
}
pub fn readUnits(r: *Reader, unit_width: usize, padded: bool) ![]const u8 {
    return take(r, try r.readInt(u32), unit_width, padded);
}
pub fn readBytes(r: *Reader, code_page: u16) ![]const u8 {
    const count = try r.readInt(u32);
    const unit_width = width(code_page);
    if (count % unit_width != 0) return error.InvalidSummaryStringSize;
    return take(r, count / unit_width, unit_width, true);
}
