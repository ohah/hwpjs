//! Header feature policy only; stream format selection belongs to its decoder.
const Header = @import("file_header.zig").Header;
pub const Distribution = enum { reject, observed_viewtext };

pub fn requireSupported(header: *const Header, distribution: Distribution) !void {
    try header.version().requireSupported();
    if (header.has(.encrypted) or header.has(.certificate_encryption))
        return error.UnsupportedEncryption;
    if (header.has(.drm) or header.has(.certificate_drm)) return error.UnsupportedDrm;
    if (header.has(.distribution) and distribution == .reject) return error.UnsupportedDistribution;
}
