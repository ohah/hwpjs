const Reader = @import("../../binary/reader.zig").Reader;
const header = @import("header.zig");
const sub = @import("sub_blocks.zig");
pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_blocks: usize = 100000,
    max_sub_blocks: usize = 1000000,
    allow_trailing_bytes: bool = false,
};
pub const Control = struct {
    flags: u8,
    delay: u16,
    transparent_index: u8,
};
pub const Image = struct {
    left: u16,
    top: u16,
    width: u16,
    height: u16,
    flags: u8,
    local_palette: []const u8,
    minimum_code_size: u8,
    data: sub.View,
    control: ?Control,
};
pub const Text = struct { header: []const u8, data: sub.View, control: ?Control };
pub const Application = struct { header: []const u8, data: sub.View };
pub const Block = union(enum) {
    control: Control,
    image: Image,
    text: Text,
    comment: sub.View,
    application: Application,
};
/// Allocation-free, borrowed blocks. A failed next leaves all state unchanged.
pub const Iterator = struct {
    reader: Reader,
    header: header.Header,
    options: Options,
    pending: ?Control = null,
    blocks: usize = 0,
    sub_blocks: usize = 0,
    done: bool = false,
    pub fn init(bytes: []const u8, options: Options) !Iterator {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        var r: Reader = .{ .bytes = bytes };
        const h = try header.read(&r);
        return .{ .reader = r, .header = h, .options = options };
    }
    pub fn next(self: *Iterator) !?Block {
        var next_state = self.*;
        const block = try next_state.advance();
        self.* = next_state;
        return block;
    }
    fn data(self: *Iterator) !sub.View {
        if (self.sub_blocks > self.options.max_sub_blocks) return error.LimitExceeded;
        const view = try sub.read(&self.reader, self.options.max_sub_blocks - self.sub_blocks);
        self.sub_blocks += view.blocks;
        return view;
    }
    fn advance(self: *Iterator) !?Block {
        if (self.done) return null;
        if (self.blocks >= self.options.max_blocks) return error.LimitExceeded;
        self.blocks += 1;
        switch (try self.reader.readInt(u8)) {
            0x3b => {
                if (self.pending != null) return error.UnconsumedGifControl;
                if (!self.options.allow_trailing_bytes and self.reader.offset != self.reader.bytes.len) return error.TrailingGifBytes;
                self.done = true;
                return null;
            },
            0x2c => {
                const left = try self.reader.readInt(u16);
                const top = try self.reader.readInt(u16);
                const width = try self.reader.readInt(u16);
                const height = try self.reader.readInt(u16);
                const flags = try self.reader.readInt(u8);
                if (flags & 0x18 != 0) return error.InvalidGifReservedBits;
                if (self.header.version == .gif87a and flags & 0x20 != 0) return error.InvalidGifVersionFeature;
                if (@as(u32, left) + width > self.header.width or @as(u32, top) + height > self.header.height) return error.InvalidGifImageBounds;
                const colors = try header.palette(&self.reader, flags);
                const minimum = try self.reader.readInt(u8);
                if (minimum < 2 or minimum > 8) return error.InvalidGifCodeSize;
                const chunks = try self.data();
                const control = self.pending;
                self.pending = null;
                return .{ .image = .{ .left = left, .top = top, .width = width, .height = height, .flags = flags, .local_palette = colors, .minimum_code_size = minimum, .data = chunks, .control = control } };
            },
            0x21 => {
                if (self.header.version != .gif89a) return error.InvalidGifVersionFeature;
                const label = try self.reader.readInt(u8);
                switch (label) {
                    0xf9 => {
                        if (self.pending != null) return error.DuplicateGifControl;
                        if (try self.reader.readInt(u8) != 4) return error.InvalidGifExtensionSize;
                        const flags = try self.reader.readInt(u8);
                        if (flags & 0xe0 != 0) return error.InvalidGifReservedBits;
                        const control: Control = .{ .flags = flags, .delay = try self.reader.readInt(u16), .transparent_index = try self.reader.readInt(u8) };
                        if (try self.reader.readInt(u8) != 0) return error.InvalidGifTerminator;
                        self.pending = control;
                        return .{ .control = control };
                    },
                    0xfe => return .{ .comment = try self.data() },
                    0xff => {
                        if (try self.reader.readInt(u8) != 11) return error.InvalidGifExtensionSize;
                        const fixed = try self.reader.take(11);
                        return .{ .application = .{ .header = fixed, .data = try self.data() } };
                    },
                    0x01 => {
                        if (try self.reader.readInt(u8) != 12) return error.InvalidGifExtensionSize;
                        const fixed = try self.reader.take(12);
                        const chunks = try self.data();
                        const control = self.pending;
                        self.pending = null;
                        return .{ .text = .{ .header = fixed, .data = chunks, .control = control } };
                    },
                    else => return error.UnsupportedGifExtension,
                }
            },
            else => return error.InvalidGifBlock,
        }
    }
};
