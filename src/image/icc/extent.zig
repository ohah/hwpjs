const header = @import("header.zig");
/// Common full-buffer boundary. A tag count must fit, but tag contents and header
/// semantics are not validated here. Future table/ID consumers share this owner.
pub fn inspect(bytes: []const u8, max_bytes: usize) !header.Header {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    if (bytes.len < header.size + 4) return error.InvalidIccProfileSize;
    const value = try header.parse(bytes[0..header.size]);
    if (value.profile_size != bytes.len) return error.InvalidIccProfileSize;
    return value;
}
