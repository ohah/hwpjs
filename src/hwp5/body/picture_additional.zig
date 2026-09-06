const Reader = @import("../../binary/reader.zig").Reader;
pub const Layout = enum { dimensions8, with_alpha9 };
pub const Additional = struct {
    width: u32,
    height: u32,
    alpha: ?i8,
    pub fn read(reader: *Reader, layout: Layout) !Additional {
        var r = reader.*;
        const p: Additional = .{
            .width = try r.readInt(u32),
            .height = try r.readInt(u32),
            .alpha = if (layout == .with_alpha9) try r.readInt(i8) else null,
        };
        reader.* = r;
        return p;
    }
    /// Unsigned view of the same byte, not a normalized percentage.
    pub fn alphaByte(self: Additional) ?u8 {
        return if (self.alpha) |a| @bitCast(a) else null;
    }
};
