const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
/// Table 151 field sum is 24 bytes plus both counted UTF-16 strings, not 18.
pub const Properties = struct {
    main_text: []const u8,
    sub_text: []const u8,
    position: u32,
    size_ratio: u32,
    option: u32,
    style_number: u32,
    alignment: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .main_text = try string.read(&r),
            .sub_text = try string.read(&r),
            .position = try r.readInt(u32),
            .size_ratio = try r.readInt(u32),
            .option = try r.readInt(u32),
            .style_number = try r.readInt(u32),
            .alignment = try r.readInt(u32),
            .extra = bytes[r.offset..],
        };
    }
};
