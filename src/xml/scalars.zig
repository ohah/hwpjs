const unicode = @import("../text/scalars.zig");
pub const Encoding = unicode.Encoding;
pub const Scalar = unicode.Scalar;
/// Strict Unicode only; no XML character policy, BOM stripping or normalization.
pub fn read(bytes: []const u8, offset: usize, encoding: Encoding) !?Scalar {
    return unicode.read(bytes, offset, encoding) catch |err| switch (err) {
        error.InvalidUnicodeEncoding => error.InvalidXmlEncoding,
        else => err,
    };
}
