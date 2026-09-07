const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const payload = try r.readInt(u32);
    const view = try core.hwp5.history.last_document.View.parseObserved(bytes[r.offset..], .{ .max_records = limit, .max_payload_bytes = payload });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try @import("document-probe.zig").fields(a, &out, view.report);
    try out.appendSlice(a, view.raw);
    return out.toOwnedSlice(a);
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), optional: @FieldType(core.hwp5.container_validation.Report, "history")) !void {
    const last = if (optional) |h| h.last_document else null;
    try int(a, out, u32, @intFromBool(last != null));
    if (last) |report| try @import("document-probe.zig").fields(a, out, report);
}
