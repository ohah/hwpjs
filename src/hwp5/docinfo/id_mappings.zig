const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;

pub const Field = enum(u8) {
    bin_data = 0,
    font_korean = 1,
    font_english = 2,
    font_hanja = 3,
    font_japanese = 4,
    font_other = 5,
    font_symbol = 6,
    font_user = 7,
    border_fill = 8,
    char_shape = 9,
    tab_def = 10,
    numbering = 11,
    bullet = 12,
    para_shape = 13,
    style = 14,
    memo_shape = 15,
    track_change = 16,
    track_change_author = 17,
};
const base_count = @intFromEnum(Field.style) + 1;
const known_count = @typeInfo(Field).@"enum".fields.len;

/// Signed wire values; not allocation sizes. Actual presence is separate from
/// the version's expected field count (older real files can contain memo_shape).
pub const IdMappings = struct {
    raw: []const u8,
    version: Version,

    pub fn parse(bytes: []const u8, version: Version) !IdMappings {
        try version.requireSupported();
        if (bytes.len < base_count * @sizeOf(i32)) return error.UnexpectedEnd;
        if (bytes.len % 4 != 0) return error.InvalidMappingSize;
        return .{ .raw = bytes, .version = version };
    }
    pub fn count(self: IdMappings) usize {
        return self.raw.len / 4;
    }
    pub fn expectedCount(self: IdMappings) usize {
        if (self.version.raw >= 0x05000302) return known_count;
        if (self.version.raw >= 0x05000201) return @intFromEnum(Field.memo_shape) + 1;
        return base_count;
    }
    pub fn get(self: IdMappings, field: Field) ?i32 {
        const index: usize = @intFromEnum(field);
        if (index >= self.count()) return null;
        var r: Reader = .{ .bytes = self.raw, .offset = index * 4 };
        return r.readInt(i32) catch unreachable;
    }
    pub fn extra(self: IdMappings) []const u8 {
        return self.raw[@min(self.raw.len, known_count * @sizeOf(i32))..];
    }
};
