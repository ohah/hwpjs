const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn read(r: *core.Reader) !@FieldType(core.hwp5.container_validation.Options, "xml_template") {
    const mode = try r.readInt(u8);
    if (mode > 2) return error.InvalidMode;
    const bytes = try r.readInt(u32);
    return if (mode == 0) null else .{ .encoding = if (mode == 1) .decoded else .observed_hwp_compressed, .max_decoded_bytes = bytes };
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), optional: @FieldType(core.hwp5.container_validation.Report, "xml_template")) !void {
    try int(a, out, u32, @intFromBool(optional != null));
    const r = optional orelse return;
    for ([_]usize{ @intFromBool(r.present), @intFromBool(r.declared), r.decoded_bytes, r.trailing_bytes }) |n| try int(a, out, u32, @intCast(n));
    for ([_]?usize{ r.schema_name_units, r.schema_units, r.instance_units }) |value| {
        try int(a, out, u32, @intFromBool(value != null));
        try int(a, out, u32, @intCast(value orelse 0));
    }
}
