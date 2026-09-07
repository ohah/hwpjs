const scalars = @import("scalars.zig");
pub const Encoding = scalars.Encoding;
pub const Character = scalars.Scalar;
pub const Options = struct { max_bytes: usize = 16 * 1024 * 1024, max_characters: usize = 16 * 1024 * 1024 };
/// Borrowed, complete input with explicitly selected encoding. Not an XML parser.
/// BOM/declaration recognition belongs to the separate entity bootstrap layer.
pub const Input = struct {
    bytes: []const u8,
    encoding: Encoding,
    offset: usize = 0,
    remaining: usize,

    pub fn init(bytes: []const u8, encoding: Encoding, options: Options) !Input {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        return .{ .bytes = bytes, .encoding = encoding, .remaining = options.max_characters };
    }

    /// Failed reads leave both cursor and budget unchanged. A CRLF span owns both
    /// source characters; character references must NOT pass through this layer again.
    pub fn next(self: *Input) !?Character {
        var c = (try scalars.read(self.bytes, self.offset, self.encoding)) orelse return null;
        if (!@import("characters.zig").valid(c.value)) return error.InvalidXmlCharacter;
        if (self.remaining == 0) return error.LimitExceeded;
        if (c.value == 0xd) {
            const rest = self.bytes[c.end..];
            const lf: []const u8 = switch (self.encoding) {
                .utf8 => "\n",
                .utf16le => &.{ 0xa, 0 },
                .utf16be => &.{ 0, 0xa },
            };
            if (@import("std").mem.startsWith(u8, rest, lf)) c.end += lf.len;
            c.value = 0xa;
        }
        self.offset = c.end;
        self.remaining -= 1;
        return c;
    }
};
