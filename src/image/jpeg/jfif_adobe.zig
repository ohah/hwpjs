const Header = @import("adobe.zig").Header;

/// Conservative conflict check for an explicitly selected JFIF interpretation,
/// not a T.872 printing conformance check or an Adobe version/flags validator.
pub fn validate(header: Header, components: usize) !void {
    if (components != 1 and components != 3) return error.InvalidJfifComponentCount;
    if (@intFromEnum(header.transform) > 2) return error.UnsupportedAdobeTransform;
    if ((components == 1 and header.transform != .untransformed) or
        (components == 3 and header.transform != .ycbcr)) return error.ConflictingJfifAdobeColour;
}
