const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
/// Observed EQEDIT layouts. Neither lengths nor versions select a fallback.
pub const Layout = enum { version_only, with_font };
pub const Properties = struct {
    attributes: u32,
    script: []const u8,
    font_size: u32,
    color: u32,
    baseline: i16,
    unknown: u16,
    version_info: []const u8,
    font_name: ?[]const u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{
            .attributes = try r.readInt(u32),
            .script = try string.read(&r),
            .font_size = try r.readInt(u32),
            .color = try r.readInt(u32),
            .baseline = try r.readInt(i16),
            .unknown = try r.readInt(u16),
            .version_info = try string.read(&r),
            .font_name = if (layout == .with_font) try string.read(&r) else null,
            .extra = bytes[r.offset..],
        };
    }
    pub fn lineMode(self: Properties) bool {
        return self.attributes & 1 != 0;
    }
};
