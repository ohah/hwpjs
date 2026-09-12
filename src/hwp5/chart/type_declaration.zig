const Reader = @import("../../binary/reader.zig").Reader;

pub const Declaration = struct {
    /// Includes the observed final NUL; no character encoding is inferred.
    raw_name: []const u8,
    version: u16,
};

/// Explicitly selected observed layout: u16 byte count, name including final
/// NUL, u16 version. Caller establishes that a new type declaration occurs here.
/// Does not seek markers, resolve repeated types or consume object data.
/// Borrows input; failure leaves the reader unchanged.
pub fn readObserved16(reader: *Reader, max_name_bytes: usize) !Declaration {
    var candidate = reader.*;
    const length = try candidate.readInt(u16);
    if (length > max_name_bytes) return error.LimitExceeded;
    if (length == 0) return error.InvalidChartTypeName;
    const name = try candidate.take(length);
    if (name[name.len - 1] != 0) return error.InvalidChartTypeName;
    const version = try candidate.readInt(u16);
    reader.* = candidate;
    return .{ .raw_name = name, .version = version };
}
