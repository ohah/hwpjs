const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const ModernSpacing = struct { attributes: u32, value: i32 };
pub const ParaShape = struct {
    attributes: u32,
    left: i32,
    right: i32,
    indent: i32,
    before: i32,
    after: i32,
    legacy_spacing: i32,
    tab_def_id: u16,
    head_id: u16,
    border_fill_id: u16,
    border_spacing: [4]i16,
    attributes2: ?u32,
    modern_spacing: ?ModernSpacing,
    /// Observed in 5.1 files; absent/zero kept distinct. Not used to override flags.
    level: ?u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, version: Version) !ParaShape {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var v: ParaShape = undefined;
        v.attributes = try r.readInt(u32);
        v.left = try r.readInt(i32);
        v.right = try r.readInt(i32);
        v.indent = try r.readInt(i32);
        v.before = try r.readInt(i32);
        v.after = try r.readInt(i32);
        v.legacy_spacing = try r.readInt(i32);
        v.tab_def_id = try r.readInt(u16);
        v.head_id = try r.readInt(u16);
        v.border_fill_id = try r.readInt(u16);
        for (&v.border_spacing) |*x| x.* = try r.readInt(i16);
        v.attributes2 = if (version.raw >= 0x05000107 and r.offset < bytes.len) try r.readInt(u32) else null;
        v.modern_spacing = if (version.raw >= 0x05000205 and r.offset < bytes.len) .{ .attributes = try r.readInt(u32), .value = try r.readInt(i32) } else null;
        v.level = if (version.raw >= 0x05010000 and r.offset < bytes.len) try r.readInt(u32) else null;
        v.extra = bytes[r.offset..];
        return v;
    }
};
