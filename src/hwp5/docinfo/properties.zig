const Reader = @import("../../binary/reader.zig").Reader;
pub const CaretPolicy = enum { required, observed_absent };

/// Seven u16 values followed by three u32 caret coordinates (§4.2.1).
/// Unknown extension bytes are borrowed, never silently discarded.
pub const Properties = struct {
    pub const base_len = 7 * @sizeOf(u16);
    pub const full_len = base_len + 3 * @sizeOf(u32);
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
    caret_present: bool = true,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !Properties {
        return parseWithCaretPolicy(bytes, .required);
    }

    pub fn parseWithCaretPolicy(bytes: []const u8, policy: CaretPolicy) !Properties {
        var r: Reader = .{ .bytes = bytes };
        const present = !(policy == .observed_absent and bytes.len == base_len);
        return .{
            .section_count = try r.readInt(u16),
            .page_start = try r.readInt(u16),
            .footnote_start = try r.readInt(u16),
            .endnote_start = try r.readInt(u16),
            .picture_start = try r.readInt(u16),
            .table_start = try r.readInt(u16),
            .equation_start = try r.readInt(u16),
            .caret_list = if (present) try r.readInt(u32) else 0,
            .caret_paragraph = if (present) try r.readInt(u32) else 0,
            .caret_character = if (present) try r.readInt(u32) else 0,
            .caret_present = present,
            .extra = bytes[r.offset..],
        };
    }
};
