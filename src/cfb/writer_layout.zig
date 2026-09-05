const std = @import("std");
const lockSector = @import("strict.zig").rangeLock;

pub fn ceil(n: usize, unit: usize) usize {
    return n / unit + @intFromBool(n % unit != 0);
}

pub const Layout = struct {
    sector_size: usize,
    payload: usize,
    fats: usize,
    difats: usize,
    sectors: usize,
    bytes: usize,

    pub fn init(payload: usize, version: u16, max_bytes: usize) !Layout {
        const s: usize = switch (version) {
            3 => 512,
            4 => 4096,
            else => return error.UnsupportedVersion,
        };
        var fats: usize = 1;
        var difats: usize = 0;
        while (true) {
            const logical = try std.math.add(usize, payload, try std.math.add(usize, fats, difats));
            const physical = try std.math.add(usize, logical, @intFromBool(logical > lockSector(s)));
            const need_fats = ceil(physical, s / 4);
            const need_difats = ceil(need_fats -| 109, s / 4 - 1);
            if (need_fats == fats and need_difats == difats) {
                if (physical > 0xfffffffb) return error.InvalidFileSize;
                const bytes = try std.math.mul(usize, try std.math.add(usize, physical, 1), s);
                if (version == 3 and bytes > 0x80000000) return error.InvalidFileSize;
                if (bytes > max_bytes) return error.LimitExceeded;
                return .{ .sector_size = s, .payload = payload, .fats = fats, .difats = difats, .sectors = physical, .bytes = bytes };
            }
            fats = need_fats;
            difats = need_difats;
        }
    }

    pub fn id(self: Layout, logical: usize) u32 {
        return @intCast(logical + @intFromBool(logical >= lockSector(self.sector_size)));
    }
    pub fn sector(self: Layout, bytes: []u8, logical: usize) []u8 {
        return bytes[(@as(usize, self.id(logical)) + 1) * self.sector_size ..][0..self.sector_size];
    }
};
