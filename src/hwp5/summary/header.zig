const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const hwp_fmt = [_]u8{ 0x60, 0xb6, 0xa2, 0x9f, 0x61, 0x10, 0xd4, 0x11, 0xb4, 0xc6, 0, 0x60, 0x97, 0xc0, 0x9d, 0x8c };
pub const Header = struct {
    raw: []const u8,
    version: u16,
    system: u32,
    set_offset: usize,
    pub fn parse(bytes: []const u8) !Header {
        var r: Reader = .{ .bytes = bytes };
        if (try r.readInt(u16) != 0xfffe) return error.InvalidSummaryByteOrder;
        const version = try r.readInt(u16);
        if (version > 1) return error.UnsupportedSummaryVersion;
        const system = try r.readInt(u32);
        _ = try r.take(16); // CLSID is application metadata, not a signature.
        const sets = try r.readInt(u32);
        if (sets != 1) return error.UnsupportedSummaryLayout;
        const fmt = try r.take(16);
        if (!std.mem.eql(u8, fmt, &hwp_fmt)) return error.UnsupportedSummaryFormat;
        const offset = try r.readInt(u32);
        if (offset < r.offset or offset > bytes.len) return error.InvalidSummaryOffset;
        return .{ .raw = bytes[0..r.offset], .version = version, .system = system, .set_offset = offset };
    }
};
