const Reader = @import("../../binary/reader.zig").Reader;
pub const control = @import("control.zig");
const Header = @import("paragraph_header.zig").Header;
pub const Token = struct {
    /// Original UTF-16 code-unit offset, not UTF-8 bytes or Unicode scalars.
    start_unit: usize,
    raw: []const u8,
    value: union(enum) { text: []const u8, control: control.Control },
};
pub const Iterator = struct {
    reader: Reader,
    pub fn init(bytes: []const u8) !Iterator {
        if (bytes.len % 2 != 0) return error.InvalidTextSize;
        return .{ .reader = .{ .bytes = bytes } };
    }
    /// Failure is atomic. Control payload bytes never become visible text.
    pub fn next(self: *Iterator) !?Token {
        var r = self.reader;
        if (r.offset == r.bytes.len) return null;
        const start = r.offset;
        const code = try r.readInt(u16);
        const value: @FieldType(Token, "value") = if (control.kind(code)) |k| value: {
            const extended = control.units(k) == 8;
            const data = try r.take(if (extended) 12 else 0);
            const closing: ?u16 = if (extended) try r.readInt(u16) else null;
            if (closing) |c| if (c != code) return error.InvalidControlTerminator;
            break :value .{ .control = .{ .code = code, .kind = k, .data = data, .closing_code = closing } };
        } else value: {
            while (r.offset < r.bytes.len) {
                var look = r;
                if (control.kind(try look.readInt(u16)) != null) break;
                r = look;
            }
            break :value .{ .text = r.bytes[start..r.offset] };
        };
        self.reader = r;
        return .{ .start_unit = start / 2, .raw = r.bytes[start..r.offset], .value = value };
    }
};
pub const Text = struct {
    raw: []const u8,
    pub fn parse(bytes: []const u8) !Text {
        var it = try Iterator.init(bytes);
        while (try it.next()) |_| {}
        return .{ .raw = bytes };
    }
    pub fn tokens(self: Text) Iterator {
        return .{ .reader = .{ .bytes = self.raw } };
    }
    pub fn unitCount(self: Text) usize {
        return self.raw.len / 2;
    }
    /// Caller must pair this text with its owning header; no hierarchy guessing.
    pub fn validateCount(self: Text, header: Header) !void {
        if (self.unitCount() != header.characterUnits()) return error.ParagraphTextCountMismatch;
    }
};
