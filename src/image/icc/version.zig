pub const Version = struct {
    major: u8,
    minor: u8,
    bugfix: u8,
};
/// ICC.1 wire version, not certification of a particular revision's semantics.
pub fn parse(bytes: []const u8) !Version {
    if (bytes.len != 4) return error.InvalidIccVersionSize;
    if (bytes[0] >> 4 > 9 or bytes[0] & 15 > 9 or bytes[1] >> 4 > 9 or bytes[1] & 15 > 9)
        return error.InvalidIccVersionBcd;
    if (bytes[2] != 0 or bytes[3] != 0) return error.InvalidIccVersionReserved;
    const major = (bytes[0] >> 4) * 10 + (bytes[0] & 15);
    if (major != 2 and major != 4) return error.UnsupportedIccVersion;
    return .{ .major = major, .minor = bytes[1] >> 4, .bugfix = bytes[1] & 15 };
}
