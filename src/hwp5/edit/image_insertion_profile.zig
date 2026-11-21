//! Own new-picture policy matching the existing explicit reader layouts.
//! 75 is the host 96-dpi source basis (7200 HWPUNIT/in / 96 px/in),
//! not a universal pixel resolution stated by picture table107.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Layout = enum { effects_only, dimensions8, with_alpha9 };
pub const units_per_pixel: u32 = 7200 / 96;
pub fn layout(version: Version) !Layout {
    return switch (version.raw) {
        0x05000300 => .effects_only,
        0x05000304, 0x05000500 => .dimensions8,
        0x05010001, 0x05010100 => .with_alpha9,
        else => error.UnsupportedPictureInsertionVersion,
    };
}
pub fn sourceSize(pixels: @import("../../image/picture_input.zig").PixelSize) !@import("../../image/image_insertion.zig").Size {
    if (pixels.width == 0 or pixels.height == 0) return error.InvalidPictureInsertionSourceSize;
    const max_pixels: u32 = std.math.maxInt(i32) / units_per_pixel;
    if (pixels.width > max_pixels or pixels.height > max_pixels) return error.InvalidPictureInsertionSourceSize;
    return .{ .width = pixels.width * units_per_pixel, .height = pixels.height * units_per_pixel };
}
