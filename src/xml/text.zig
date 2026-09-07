const std = @import("std");
const scalars = @import("scalars.zig");
/// Borrowed encoded text; ASCII comparison never normalizes or allocates.
pub const View = struct {
    raw: []const u8,
    encoding: scalars.Encoding,
    pub fn equals(self: View, ascii: []const u8, ignore_case: bool) bool {
        var offset: usize = 0;
        for (ascii) |b| {
            const c = (scalars.read(self.raw, offset, self.encoding) catch return false) orelse return false;
            if (c.value > 127) return false;
            const v: u8 = @intCast(c.value);
            if (if (ignore_case) std.ascii.toLower(v) != std.ascii.toLower(b) else v != b) return false;
            offset = c.end;
        }
        return offset == self.raw.len;
    }
};
