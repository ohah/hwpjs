const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
pub const Version = @import("version.zig").Version;
const signature = "HWP Document File";

pub const Flag = enum(u5) {
    compressed,
    encrypted,
    distribution,
    script,
    drm,
    xml_template,
    history,
    digital_signature,
    certificate_encryption,
    signature_preview,
    certificate_drm,
    ccl,
    mobile,
    privacy,
    track_changes,
    kogl,
    video,
    contents_field,
};
pub const LicenseFlag = enum(u5) { ccl_kogl, copy_restricted, same_condition };

/// Owns every header byte; parsing does not claim support for its version/features.
pub const Header = struct {
    raw: [256]u8,

    pub fn parse(bytes: []const u8) !Header {
        if (bytes.len != 256) return error.InvalidHeaderSize;
        if (!std.mem.eql(u8, bytes[0..signature.len], signature) or
            !std.mem.allEqual(u8, bytes[signature.len..32], 0)) return error.InvalidSignature;
        return .{ .raw = bytes[0..256].* };
    }
    fn word(self: *const Header, offset: usize) u32 {
        var r: Reader = .{ .bytes = &self.raw, .offset = offset };
        return r.readInt(u32) catch unreachable;
    }
    pub fn version(self: *const Header) Version {
        return .{ .raw = self.word(32) };
    }
    pub fn flags(self: *const Header) u32 {
        return self.word(36);
    }
    pub fn has(self: *const Header, flag: Flag) bool {
        return self.flags() & (@as(u32, 1) << @intFromEnum(flag)) != 0;
    }
    pub fn licenseFlags(self: *const Header) u32 {
        return self.word(40);
    }
    pub fn hasLicense(self: *const Header, flag: LicenseFlag) bool {
        return self.licenseFlags() & (@as(u32, 1) << @intFromEnum(flag)) != 0;
    }
    pub fn encryptVersion(self: *const Header) u32 {
        return self.word(44);
    }
    pub fn country(self: *const Header) u8 {
        return self.raw[48];
    }
};
