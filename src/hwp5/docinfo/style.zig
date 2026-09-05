const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const Style = struct {
    local_utf16: []const u8,
    english_utf16: []const u8,
    attributes: u8,
    next_style_id: u8,
    language_id: i16,
    para_shape_id: u16,
    char_shape_id: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Style {
        var r: Reader = .{ .bytes = bytes };
        return .{ .local_utf16 = try string.read(&r), .english_utf16 = try string.read(&r), .attributes = try r.readInt(u8), .next_style_id = try r.readInt(u8), .language_id = try r.readInt(i16), .para_shape_id = try r.readInt(u16), .char_shape_id = try r.readInt(u16), .extra = bytes[r.offset..] };
    }
};
