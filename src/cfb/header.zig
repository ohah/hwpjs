const std = @import("std");
pub const end: u32 = 0xfffffffe;
pub const free: u32 = 0xffffffff;
pub const fat_sector: u32 = 0xfffffffd;
pub const difat_sector: u32 = 0xfffffffc;

pub fn int(comptime T: type, bytes: []const u8, offset: usize) error{Truncated}!T {
    if (offset > bytes.len or @sizeOf(T) > bytes.len - offset) return error.Truncated;
    return std.mem.readInt(T, bytes[offset..][0..@sizeOf(T)], .little);
}

pub const Header = struct {
    major: u16,
    minor: u16,
    byte_order: u16,
    sector_size: usize,
    directory_count: u32,
    fat_count: u32,
    directory_start: u32,
    transaction: u32,
    mini_start: u32,
    mini_count: u32,
    difat_start: u32,
    difat_count: u32,

    pub fn parse(bytes: []const u8) !Header {
        if (bytes.len < 512) return error.Truncated;
        if (!std.mem.eql(u8, bytes[0..8], &.{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 }))
            return error.InvalidSignature;
        const major = try int(u16, bytes, 26);
        const shift: u16 = switch (major) {
            3 => 9,
            4 => 12,
            else => return error.UnsupportedVersion,
        };
        if (try int(u16, bytes, 30) != shift or try int(u16, bytes, 32) != 6)
            return error.InvalidSectorSize;
        if (!std.mem.allEqual(u8, bytes[34..40], 0) or try int(u32, bytes, 56) != 4096)
            return error.InvalidHeader;
        if (major == 3 and try int(u32, bytes, 40) != 0) return error.InvalidHeader;
        const size: usize = if (major == 3) 512 else 4096;
        if (bytes.len < size) return error.Truncated;
        // Match legacy cfb.js: preserve rather than reject noncanonical minor/BOM/CLSID.
        return .{
            .major = major,
            .minor = try int(u16, bytes, 24),
            .byte_order = try int(u16, bytes, 28),
            .sector_size = size,
            .directory_count = try int(u32, bytes, 40),
            .fat_count = try int(u32, bytes, 44),
            .directory_start = try int(u32, bytes, 48),
            .transaction = try int(u32, bytes, 52),
            .mini_start = try int(u32, bytes, 60),
            .mini_count = try int(u32, bytes, 64),
            .difat_start = try int(u32, bytes, 68),
            .difat_count = try int(u32, bytes, 72),
        };
    }
};
