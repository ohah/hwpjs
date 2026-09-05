const std = @import("std");
const format = @import("format.zig");
pub const end: u32 = 0xfffffffe;
pub const free: u32 = 0xffffffff;
pub const fat_sector: u32 = 0xfffffffd;
pub const difat_sector: u32 = 0xfffffffc;

pub const Diagnostic = struct {
    buffer: [256]u8 = undefined,
    message: []const u8 = "",

    fn note(self: ?*Diagnostic, comptime fmt: []const u8, args: anytype) void {
        if (self) |d| d.message = std.fmt.bufPrint(&d.buffer, fmt, args) catch "";
    }
};

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
        return parseDiagnostic(bytes, null);
    }

    /// The same validation branches produce native error codes and JS diagnostics.
    pub fn parseDiagnostic(bytes: []const u8, diagnostic: ?*Diagnostic) !Header {
        if (diagnostic) |d| d.message = "";
        if (bytes.len < 512) {
            Diagnostic.note(diagnostic, "CFB file size {d} < 512", .{bytes.len});
            return error.Truncated;
        }
        if (!std.mem.eql(u8, bytes[0..8], &.{ 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 })) {
            Diagnostic.note(diagnostic, "Header Signature: Expected d0cf11e0a1b11ae1 saw {s}", .{std.fmt.bytesToHex(bytes[0..8].*, .lower)});
            return error.InvalidSignature;
        }
        const major = try int(u16, bytes, 26);
        const shift: u16 = switch (major) {
            3 => 9,
            4 => 12,
            else => {
                Diagnostic.note(diagnostic, "Major Version: Expected 3 or 4 saw {d}", .{major});
                return error.UnsupportedVersion;
            },
        };
        const actual_shift = try int(u16, bytes, 30);
        if (actual_shift != shift) {
            if (actual_shift == 9 or actual_shift == 12)
                Diagnostic.note(diagnostic, "Sector Shift: Expected {d} saw {d}", .{ actual_shift, actual_shift })
            else
                Diagnostic.note(diagnostic, "Sector Shift: Expected 9 or 12 saw {d}", .{actual_shift});
            return error.InvalidSectorSize;
        }
        if (try int(u16, bytes, 32) != format.mini_sector_shift) {
            Diagnostic.note(diagnostic, "Mini Sector Shift: Expected 0600 saw {s}", .{std.fmt.bytesToHex(bytes[32..34].*, .lower)});
            return error.InvalidSectorSize;
        }
        if (!std.mem.allEqual(u8, bytes[34..40], 0)) {
            Diagnostic.note(diagnostic, "Reserved: Expected 000000000000 saw {s}", .{std.fmt.bytesToHex(bytes[34..40].*, .lower)});
            return error.InvalidHeader;
        }
        if (major == 3 and try int(u32, bytes, 40) != 0) {
            Diagnostic.note(diagnostic, "# Directory Sectors: Expected 0 saw {d}", .{try int(i32, bytes, 40)});
            return error.InvalidHeader;
        }
        if (try int(u32, bytes, 56) != format.mini_stream_cutoff) {
            Diagnostic.note(diagnostic, "Mini Stream Cutoff Size: Expected 00100000 saw {s}", .{std.fmt.bytesToHex(bytes[56..60].*, .lower)});
            return error.InvalidHeader;
        }
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
