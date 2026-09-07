const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const max_forms = try r.readInt(u32);
    const max_bytes = try r.readInt(u32);
    const max_nodes = try r.readInt(u32);
    const max_depth = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    var report = try core.hwp5.form_control.collectObservedUnits(a, tree, .{ .max_forms = max_forms, .properties = .{ .max_input_bytes = max_bytes, .max_nodes = max_nodes, .max_depth = max_depth } });
    defer report.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ report.forms.len, report.total_property_bytes, report.total_property_nodes }) |n| try int(a, &out, u32, @intCast(n));
    for (report.forms) |f| {
        for ([_]usize{ f.control_node, f.object_node, f.other_direct_children, @intFromEnum(f.envelope.kind()), f.properties.nodes.len }) |n| try int(a, &out, u32, @intCast(n));
        const p = f.common;
        try int(a, &out, u32, p.flags);
        try int(a, &out, i32, p.offset_y);
        try int(a, &out, i32, p.offset_x);
        try int(a, &out, u32, p.width);
        try int(a, &out, u32, p.height);
        try int(a, &out, i32, p.z_order);
        try int(a, &out, u32, p.instance_id);
        try int(a, &out, i32, p.prevent_page_break);
        try int(a, &out, u32, if (p.description_utf16) |d| @intCast(d.len) else 0xffffffff);
        try int(a, &out, u32, @intCast(p.extra.len));
        try int(a, &out, u32, @intCast(f.envelope.extra.len));
        try int(a, &out, u32, f.envelope.raw_length);
        try int(a, &out, u32, @intCast(f.envelope.properties.len));
        for (p.margins) |m| try int(a, &out, i16, m);
        try out.appendSlice(a, &f.envelope.type_id);
        try out.appendSlice(a, &f.envelope.secondary_type_id);
        try out.appendSlice(a, p.description_utf16 orelse &.{});
        try out.appendSlice(a, p.extra);
        try out.appendSlice(a, f.envelope.extra);
        try out.appendSlice(a, f.envelope.properties);
    }
    return out.toOwnedSlice(a);
}
