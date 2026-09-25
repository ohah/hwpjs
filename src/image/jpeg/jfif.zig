const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Frame = @import("frame.zig").Frame;
const Rgb = @import("thumbnail.zig").Rgb;

pub const Units = enum(u8) { aspect_ratio = 0, dots_per_inch = 1, dots_per_centimetre = 2 };
pub const ComponentIds = enum { strict, observed_zero_based_three };

/// JFIF APP0 payload, excluding marker and segment length. Thumbnail borrows
/// immutable input. Parsing does not certify placement or whole-file JFIF rules.
pub const Header = struct {
    version: u16,
    units: Units,
    horizontal_density: u16,
    vertical_density: u16,
    thumbnail_width: u8,
    thumbnail_height: u8,
    thumbnail_rgb: []const u8,

    pub fn parse(bytes: []const u8) !Header {
        if (bytes.len > 65533) return error.LimitExceeded;
        var reader: Reader = .{ .bytes = bytes };
        if (!std.mem.eql(u8, try reader.take(5), "JFIF\x00")) return error.InvalidJfifIdentifier;
        const version = try big16(&reader);
        // Original JFIF 1.02 recommends major-version compatibility. Preserve
        // every minor value rather than silently rewriting legacy 1.01 to 1.02.
        if (version >> 8 != 1) return error.UnsupportedJfifVersion;
        const unit = try reader.readInt(u8);
        if (unit > 2) return error.InvalidJfifUnits;
        const units: Units = @enumFromInt(unit);
        const horizontal = try big16(&reader);
        const vertical = try big16(&reader);
        if (horizontal == 0 or vertical == 0) return error.InvalidJfifDensity;
        const thumbnail = try Rgb.read(&reader, false);
        if (reader.offset != bytes.len) return error.TrailingJfifBytes;
        return .{ .version = version, .units = units, .horizontal_density = horizontal, .vertical_density = vertical, .thumbnail_width = thumbnail.dimensions.width, .thumbnail_height = thumbnail.dimensions.height, .thumbnail_rgb = thumbnail.bytes };
    }
};

/// T.871 6.1/6.2/10.1 constraints on a previously parsed frame. Separate from
/// payload parsing: callers must also establish SOI/APP0 placement and absence
/// of conflicting metadata before selecting a colour interpretation.
pub fn validateFrame(frame: Frame) !void {
    _ = try classifyFrame(frame, .strict);
}

/// The observed profile is an explicit decoding exception, not JFIF validity.
/// It accepts only three ordered components 0,1,2; grayscale ID 0 remains
/// outside this exception.
pub fn classifyFrame(frame: Frame, policy: ComponentIds) !bool {
    if (frame.precision != 8) return error.InvalidJfifPrecision;
    const count = frame.components.count();
    if (count != 1 and count != 3) return error.InvalidJfifComponentCount;
    var strict = true;
    var zero_based = count == 3 and policy == .observed_zero_based_three;
    for (0..count) |i| {
        const id = frame.components.get(i).?.id;
        strict = strict and id == i + 1;
        zero_based = zero_based and id == i;
    }
    if (strict) return false;
    if (zero_based) return true;
    return error.InvalidJfifComponentId;
}

fn big16(reader: *Reader) !u16 {
    return std.mem.readInt(u16, (try reader.take(2))[0..2], .big);
}
