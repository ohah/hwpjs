const std = @import("std");
const scalars = @import("scalars.zig");
/// Borrowed encoded text; ASCII comparison never normalizes or allocates.
pub const View = struct {
    raw: []const u8,
    encoding: scalars.Encoding,
    pub fn equals(self: View, ascii: []const u8, ignore_case: bool) bool {
        if (self.encoding == .utf8) {
            if (self.raw.len != ascii.len) return false;
            for (ascii) |b| if (b > 127) return false;
            return if (ignore_case) std.ascii.eqlIgnoreCase(self.raw, ascii) else std.mem.eql(u8, self.raw, ascii);
        }
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

test "XML text comparison UTF8 byte fast path agrees with scalar oracle" {
    const Oracle = struct {
        fn equals(view: View, ascii: []const u8, ignore_case: bool) bool {
            var offset: usize = 0;
            for (ascii) |b| {
                const c = (scalars.read(view.raw, offset, view.encoding) catch return false) orelse return false;
                if (c.value > 127) return false;
                const value: u8 = @intCast(c.value);
                if (if (ignore_case) std.ascii.toLower(value) != std.ascii.toLower(b) else value != b) return false;
                offset = c.end;
            }
            return offset == view.raw.len;
        }
    };
    for (0..256) |raw_byte| for (0..256) |expected_byte| {
        const raw = [_]u8{@intCast(raw_byte)};
        const expected = [_]u8{@intCast(expected_byte)};
        const view: View = .{ .raw = &raw, .encoding = .utf8 };
        for ([_]bool{ false, true }) |fold| try std.testing.expectEqual(Oracle.equals(view, &expected, fold), view.equals(&expected, fold));
    };
    const inputs = [_][]const u8{ "", "fieldBegin", "FIELDBEGIN", "가", "\xc2\xa0", "\xc0\xaf", "\xed\xa0\x80", "\xff", "\x00A\x7f", "fieldBegin\xff" };
    for (inputs) |raw| for (inputs) |expected| {
        const view: View = .{ .raw = raw, .encoding = .utf8 };
        for ([_]bool{ false, true }) |fold| try std.testing.expectEqual(Oracle.equals(view, expected, fold), view.equals(expected, fold));
    };
    inline for (.{ scalars.Encoding.utf16le, scalars.Encoding.utf16be }) |encoding| {
        const endian: std.builtin.Endian = if (encoding == .utf16le) .little else .big;
        const units = [_]u16{ 0, 0x7f, 0x80, 0x41, 0x61, 0xd800, 0xdc00, 0xffff };
        for (units) |first| for (units) |second| {
            var raw: [4]u8 = undefined;
            std.mem.writeInt(u16, raw[0..2], first, endian);
            std.mem.writeInt(u16, raw[2..4], second, endian);
            for ([_]usize{ 1, 2, 3, 4 }) |length| for (inputs) |expected| {
                const view: View = .{ .raw = raw[0..length], .encoding = encoding };
                for ([_]bool{ false, true }) |fold| try std.testing.expectEqual(Oracle.equals(view, expected, fold), view.equals(expected, fold));
            };
        };
    }
}
