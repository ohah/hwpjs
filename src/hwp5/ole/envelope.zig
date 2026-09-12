const Reader = @import("../../binary/reader.zig").Reader;

pub const Layout = enum { raw_cfb, observed_size_prefix };

/// Borrows the decoded BinData bytes. Does not validate CFB or infer a layout.
pub fn payload(bytes: []const u8, layout: Layout, limit: usize) ![]const u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (layout == .raw_cfb) return bytes;
    var reader: Reader = .{ .bytes = bytes };
    const size = try reader.readInt(u32);
    const remaining = bytes[reader.offset..];
    if (size != remaining.len) return error.InvalidOleEnvelopeSize;
    return remaining;
}
