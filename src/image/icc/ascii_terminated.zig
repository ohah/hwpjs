/// Validate the stored bytes without stripping NULs or normalizing text.
pub fn validate(bytes: []const u8) !void {
    if (bytes.len == 0 or bytes[bytes.len - 1] != 0) return error.InvalidIccTextTerminator;
    for (bytes) |b| if (b > 0x7f) return error.InvalidIccAscii;
}
