const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const control_id: u32 = 0x73656364;
/// Properties only; page/note/border records are children, not inline bytes.
pub const Definition = struct {
    flags: u32,
    column_gap: i16,
    vertical_grid: i16,
    horizontal_grid: i16,
    tab_spacing: u32,
    numbering_id: u16,
    page_start: u16,
    picture_start: u16,
    table_start: u16,
    equation_start: u16,
    language: ?u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8, version: Version) !Definition {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var d: Definition = undefined;
        d.flags = try r.readInt(u32);
        d.column_gap = try r.readInt(i16);
        d.vertical_grid = try r.readInt(i16);
        d.horizontal_grid = try r.readInt(i16);
        d.tab_spacing = try r.readInt(u32);
        d.numbering_id = try r.readInt(u16);
        d.page_start = try r.readInt(u16);
        d.picture_start = try r.readInt(u16);
        d.table_start = try r.readInt(u16);
        d.equation_start = try r.readInt(u16);
        d.language = if (version.raw >= 0x05000105) try r.readInt(u16) else null;
        d.extra = bytes[r.offset..];
        return d;
    }
};
