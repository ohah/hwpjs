const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
const rules = @import("control_rules.zig");

pub fn supports(control_id: u32) bool {
    return control_id == rules.table_id or control_id == rules.drawing_id or control_id == rules.equation_id;
}

/// Table 69, excluding the control ID. All slices borrow the input.
/// Description absence is observed in 5.0.1.7; no unproven version cutoff.
pub const Properties = struct {
    flags: u32,
    offset_y: i32,
    offset_x: i32,
    width: u32,
    height: u32,
    z_order: i32,
    margins: [4]i16,
    instance_id: u32,
    prevent_page_break: i32,
    description_utf16: ?[]const u8,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        var p: Properties = undefined;
        p.flags = try r.readInt(u32);
        p.offset_y = try r.readInt(i32);
        p.offset_x = try r.readInt(i32);
        p.width = try r.readInt(u32);
        p.height = try r.readInt(u32);
        p.z_order = try r.readInt(i32);
        for (&p.margins) |*m| m.* = try r.readInt(i16);
        p.instance_id = try r.readInt(u32);
        p.prevent_page_break = try r.readInt(i32);
        p.description_utf16 = if (r.offset < bytes.len) try string.read(&r) else null;
        p.extra = bytes[r.offset..];
        return p;
    }
};
