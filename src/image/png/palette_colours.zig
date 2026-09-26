const Header = @import("header.zig").Header;

/// Owned PLTE colours; only entries[0..count] are meaningful.
pub const Palette = struct {
    entries: [256][3]u8 = undefined,
    count: usize,

    pub fn parse(header: Header, bytes: []const u8) !Palette {
        const count = try header.palette(bytes);
        var result: Palette = .{ .count = count };
        for (result.entries[0..count], 0..) |*entry, index| {
            entry.* = bytes[index * 3 ..][0..3].*;
        }
        return result;
    }
};
