const Reader = @import("../../binary/reader.zig").Reader;
pub const Format = enum { rle4, rle8 };
pub const Padding = enum { require_zero, preserve };
pub const Options = struct {
    padding: Padding,
    max_bytes: usize = 64 * 1024 * 1024,
    max_commands: usize = 1000000,
};
pub const Run = struct {
    format: Format,
    count: u8,
    /// Encoded runs borrow one byte; absolute runs borrow packed index bytes.
    bytes: []const u8,
    encoded: bool,
    padding: ?u8 = null,
    pub fn index(self: Run, at: u8) !u8 {
        if (at >= self.count) return error.InvalidBmpRleRunIndex;
        const value = self.bytes[if (self.encoded) 0 else if (self.format == .rle8) at else at / 2];
        return if (self.format == .rle8) value else if (at % 2 == 0) value >> 4 else value & 15;
    }
};
pub const Command = union(enum) { run: Run, end_line, end_bitmap, delta: struct { x: u8, y: u8 } };
pub const Iterator = struct {
    reader: Reader,
    format: Format,
    options: Options,
    count: usize = 0,
    pub fn init(bytes: []const u8, format: Format, options: Options) !Iterator {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        return .{ .reader = .{ .bytes = bytes }, .format = format, .options = options };
    }
    /// A failed command leaves position/count unchanged. EOB is a command;
    /// interpreting its trailing bytes belongs to the raster consumer.
    pub fn next(self: *Iterator) !?Command {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_commands) return error.LimitExceeded;
        var r = self.reader;
        const n = try r.readInt(u8);
        const value = try r.readInt(u8);
        const command: Command = if (n != 0)
            .{ .run = .{ .format = self.format, .count = n, .encoded = true, .bytes = r.bytes[r.offset - 1 .. r.offset] } }
        else switch (value) {
            0 => .end_line,
            1 => .end_bitmap,
            2 => .{ .delta = .{ .x = try r.readInt(u8), .y = try r.readInt(u8) } },
            else => blk: {
                const size: usize = if (self.format == .rle8) value else (@as(usize, value) + 1) / 2;
                const bytes = try r.take(size);
                const padding: ?u8 = if (size % 2 != 0) try r.readInt(u8) else null;
                if (self.options.padding == .require_zero and padding != null and padding.? != 0) return error.InvalidBmpRlePadding;
                break :blk .{ .run = .{ .format = self.format, .count = value, .encoded = false, .bytes = bytes, .padding = padding } };
            },
        };
        self.reader = r;
        self.count += 1;
        return command;
    }
};
