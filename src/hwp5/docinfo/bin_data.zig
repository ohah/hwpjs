const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const Compression = enum(u2) { default = 0, compressed = 1, uncompressed = 2, reserved = 3 };
pub const StorageLayout = enum { specified, observed_optional_extension };
pub const Target = struct { id: u16, extension_utf16: ?[]const u8, extra: []const u8 };
pub const Data = union(enum) {
    link: struct { absolute_utf16: []const u8, relative_utf16: []const u8 },
    embedding: struct { id: u16, extension_utf16: []const u8 },
    storage: u16,
    unknown: []const u8,
};
pub const BinData = struct {
    attributes: u16,
    data: Data,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !BinData {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u16);
        const data: Data = switch (attributes & 15) {
            0 => .{ .link = .{ .absolute_utf16 = try string.read(&r), .relative_utf16 = try string.read(&r) } },
            1 => .{ .embedding = .{ .id = try r.readInt(u16), .extension_utf16 = try string.read(&r) } },
            2 => .{ .storage = try r.readInt(u16) },
            else => .{ .unknown = try r.take(bytes.len - r.offset) },
        };
        return .{ .attributes = attributes, .data = data, .extra = bytes[r.offset..] };
    }
    pub fn compression(self: BinData) Compression {
        return @enumFromInt((self.attributes >> 4) & 3);
    }
    /// Explicit interpretation of storage tail; parse() keeps the original spec envelope.
    /// In the observed layout an absent tail is absent extension; a present prefix must be complete.
    pub fn target(self: BinData, layout: StorageLayout) !?Target {
        return switch (self.data) {
            .embedding => |e| .{ .id = e.id, .extension_utf16 = e.extension_utf16, .extra = self.extra },
            .storage => |id| blk: {
                if (layout == .specified or self.extra.len == 0) break :blk .{ .id = id, .extension_utf16 = null, .extra = self.extra };
                var r: Reader = .{ .bytes = self.extra };
                const extension = try string.read(&r);
                break :blk .{ .id = id, .extension_utf16 = extension, .extra = self.extra[r.offset..] };
            },
            else => null,
        };
    }
    pub fn accessState(self: BinData) u2 {
        return @truncate(self.attributes >> 8);
    }
    pub fn isCompressed(self: BinData, default: bool) !bool {
        return switch (self.compression()) {
            .default => default,
            .compressed => true,
            .uncompressed => false,
            .reserved => error.UnsupportedCompression,
        };
    }
};
