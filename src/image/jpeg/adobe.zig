const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;

pub const Transform = enum(u8) { untransformed = 0, ycbcr = 1, ycck = 2, _ };
pub const Encoding = enum { rgb, ycbcr, complemented_cmyk, ycck };

/// Conventional Adobe APP14 fields. Unknown values and extension bytes survive;
/// parsing alone does not select a colour model or certify T.872 conformance.
pub const Header = struct {
    version: u16,
    flags0: u16,
    flags1: u16,
    transform: Transform,
    extra: []const u8,

    pub fn parse(payload: []const u8) !Header {
        if (payload.len > 65533) return error.LimitExceeded;
        var r: Reader = .{ .bytes = payload };
        if (!std.mem.eql(u8, try r.take(5), "Adobe")) return error.InvalidAdobeIdentifier;
        const version = try big16(&r);
        const flags0 = try big16(&r);
        const flags1 = try big16(&r);
        const transform: Transform = @enumFromInt(try r.readInt(u8));
        return .{ .version = version, .flags0 = flags0, .flags1 = flags1, .transform = transform, .extra = payload[r.offset..] };
    }

    /// T.872 6.5.3 matches six bytes, unlike the conventional five-byte prefix.
    pub fn hasPrintIdentifier(self: Header) bool {
        return self.version >> 8 == 0;
    }

    /// Local T.872 APP14 rule for three/four components only. The printing
    /// subset's frame, ICC placement, other metadata and grayscale rules belong
    /// to a higher layer. T.872 ignores the other APP14 fields; do not transfer
    /// that policy implicitly to a different Adobe decoder contract.
    pub fn printEncoding(self: Header, components: u8) !Encoding {
        if (!self.hasPrintIdentifier()) return error.InvalidPrintAdobeIdentifier;
        if (components != 3 and components != 4) return error.UnsupportedAdobeComponentCount;
        return switch (self.transform) {
            .untransformed => if (components == 3) .rgb else .complemented_cmyk,
            .ycbcr => if (components == 3) .ycbcr else error.InvalidAdobeTransformComponents,
            .ycck => if (components == 4) .ycck else error.InvalidAdobeTransformComponents,
            else => error.UnsupportedAdobeTransform,
        };
    }
};

fn big16(r: *Reader) !u16 {
    return std.mem.readInt(u16, (try r.take(2))[0..2], .big);
}
