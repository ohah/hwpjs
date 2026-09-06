const Reader = @import("../../binary/reader.zig").Reader;
const rules = @import("control_rules.zig");
pub const Kind = enum { footnote, endnote };
pub fn kind(control_id: u32) ?Kind {
    if (control_id == rules.id("fn  ")) return .footnote;
    if (control_id == rules.id("en  ")) return .endnote;
    return null;
}
/// No version/length fallback: the specification gives no meaning to its eight bytes.
pub const Layout = enum { spec8, observed16 };
pub const Observed = struct { number: u32, prefix: u16, suffix: u16, number_shape: u32, instance_id: u32 };
pub const Properties = struct {
    raw: []const u8,
    observed: ?Observed,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: Layout) !Properties {
        var r: Reader = .{ .bytes = bytes };
        const observed: ?Observed = switch (layout) {
            .spec8 => blk: {
                _ = try r.take(8);
                break :blk null;
            },
            .observed16 => .{
                .number = try r.readInt(u32),
                .prefix = try r.readInt(u16),
                .suffix = try r.readInt(u16),
                .number_shape = try r.readInt(u32),
                .instance_id = try r.readInt(u32),
            },
        };
        return .{ .raw = bytes[0..r.offset], .observed = observed, .extra = bytes[r.offset..] };
    }
};
