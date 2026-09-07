const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const kind = std.enums.fromInt(core.hwp5.form_object.Kind, try r.readInt(u32)) orelse return error.InvalidFormKind;
    const count = try r.readInt(u64);
    var tree = try core.hwp5.form_property_tree.Tree.parseObservedUnits(a, bytes[r.offset..], .{ .max_input_bytes = limit });
    defer tree.deinit(a);
    const schema = try core.hwp5.form_schema.inspectObserved(tree, kind);
    const v = core.hwp5.form_max_length.inspectObserved(tree, schema, kind);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intFromEnum(v.state));
    try int(a, &out, u32, if (v.compareCount(count)) |order| switch (order) {
        .lt => 1,
        .eq => 2,
        .gt => 3,
    } else 0);
    try int(a, &out, u32, if (v.raw) |raw| @intCast(raw.len) else 0xffffffff);
    if (v.raw) |raw| try out.appendSlice(a, raw);
    return out.toOwnedSlice(a);
}
