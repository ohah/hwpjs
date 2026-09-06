const Reader = @import("../../binary/reader.zig").Reader;
const ListHeader = @import("list_header.zig").Header;
/// Observed memo LIST_HEADER schema; not the general spec6 list layout.
pub const Header = struct {
    paragraph_count: i32,
    attributes: u32,
    text_width: u32,
    text_height: u32,
    extra: []const u8,
    pub fn parse(base: ListHeader) !Header {
        const view = try base.view(.observed8);
        var r: Reader = .{ .bytes = view.extra };
        return .{
            .paragraph_count = @bitCast(@as(u32, base.count_raw) | (@as(u32, view.unknown.?) << 16)),
            .attributes = view.attributes,
            .text_width = try r.readInt(u32),
            .text_height = try r.readInt(u32),
            .extra = view.extra[r.offset..],
        };
    }
};
