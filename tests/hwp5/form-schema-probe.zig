const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, false);
}
pub fn semantics(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, true);
}
fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize, semantic: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const kind = std.enums.fromInt(core.hwp5.form_object.Kind, try r.readInt(u32)) orelse return error.InvalidFormKind;
    const count = try r.readInt(u32);
    var tree = try core.hwp5.form_property_tree.Tree.parseObservedUnits(a, bytes[r.offset..], .{ .max_input_bytes = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.form_schema.inspectObserved(tree, kind);
    const ref = try core.hwp5.form_references.storedCharShapeObserved(tree, report, count);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (semantic) {
        const s = core.hwp5.form_semantics.inspectObserved(tree, report, kind, ref);
        inline for (std.meta.fields(@TypeOf(s))) |f| try int(a, &out, u32, @intFromEnum(@field(s, f.name)));
        return out.toOwnedSlice(a);
    }
    try int(a, &out, u32, @intCast(report.known_nodes));
    try int(a, &out, u32, @intCast(report.deferred_nodes));
    try int(a, &out, u32, switch (ref) {
        .absent => 0,
        .ordinal => 1,
        .invalid => 2,
    });
    try int(a, &out, u32, if (ref == .ordinal) @intCast(ref.ordinal) else 0xffffffff);
    for (report.fields) |node| try int(a, &out, u32, if (node) |n| @intCast(n) else 0xffffffff);
    return out.toOwnedSlice(a);
}
