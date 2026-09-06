const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, report_only: bool) ![]u8 {
    return detailed(a, bytes, limit, report_only, false);
}
pub fn identities(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return detailed(a, bytes, limit, false, true);
}
fn detailed(a: std.mem.Allocator, bytes: []const u8, limit: usize, report_only: bool, include_identity: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var links = try core.hwp5.control_links.Links.build(a, tree);
    defer links.deinit(a);
    const report = try core.hwp5.control_type_validation.inspect(links.items);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (report_only) {
        try int(a, &out, u32, @intCast(report.checked));
        try int(a, &out, u32, @intCast(report.deferred));
        return out.toOwnedSlice(a);
    }
    for (links.items) |link| {
        inline for (.{ "paragraph_node", "text_node", "control_node", "start_unit", "code", "id" }) |f| try int(a, &out, u32, @intCast(@field(link, f)));
        if (include_identity) {
            try int(a, &out, u32, link.header_id);
            try int(a, &out, u32, @intFromEnum(link.identity));
        }
    }
    return out.toOwnedSlice(a);
}
