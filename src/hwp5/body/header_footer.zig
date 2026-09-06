const Reader = @import("../../binary/reader.zig").Reader;
const rules = @import("control_rules.zig");
pub fn supports(id: u32) bool {
    return id == rules.id("head") or id == rules.id("foot");
}
/// Observed CTRL_HEADER properties. The following bytes are not inferred as width.
pub const Properties = struct {
    attributes: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        return .{ .attributes = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
    pub fn pageKind(self: Properties) u2 {
        return @truncate(self.attributes);
    }
};
/// Table 140 area fields in the owning LIST_HEADER extension, after its common view.
pub const Area = struct {
    width: u32,
    height: u32,
    text_references: u8,
    number_references: u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Area {
        var r: Reader = .{ .bytes = bytes };
        return .{ .width = try r.readInt(u32), .height = try r.readInt(u32), .text_references = try r.readInt(u8), .number_references = try r.readInt(u8), .extra = bytes[r.offset..] };
    }
};
