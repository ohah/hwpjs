const Reader = @import("../../binary/reader.zig").Reader;

/// Seven u16 values followed by three u32 caret coordinates (§4.2.1).
/// Unknown extension bytes are borrowed, never silently discarded.
pub const Properties = struct {
    section_count: u16,
    page_start: u16,
    footnote_start: u16,
    endnote_start: u16,
    picture_start: u16,
    table_start: u16,
    equation_start: u16,
    caret_list: u32,
    caret_paragraph: u32,
    caret_character: u32,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .section_count = try r.readInt(u16),
            .page_start = try r.readInt(u16),
            .footnote_start = try r.readInt(u16),
            .endnote_start = try r.readInt(u16),
            .picture_start = try r.readInt(u16),
            .table_start = try r.readInt(u16),
            .equation_start = try r.readInt(u16),
            .caret_list = try r.readInt(u32),
            .caret_paragraph = try r.readInt(u32),
            .caret_character = try r.readInt(u32),
            .extra = bytes[r.offset..],
        };
    }
};
