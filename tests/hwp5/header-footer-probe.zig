const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const v = try r.readInt(u32);
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidListLayout;
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], .{ .raw = v }, .{ .max_records = limit });
    defer tree.deinit(a);
    var groups = try core.hwp5.list_groups.Groups.build(a, tree);
    defer groups.deinit(a);
    const report = try core.hwp5.header_footer_validation.inspect(tree, groups.items, if (mode == 0) .spec6 else .observed8);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (!core.hwp5.header_footer.supports(h.id)) continue;
        const p = try core.hwp5.header_footer.Properties.parse(h.properties);
        try int(a, &out, u32, h.id);
        try int(a, &out, u32, p.attributes);
        try int(a, &out, u32, @intCast(p.extra.len));
        try out.appendSlice(a, p.extra);
    }
    for (groups.items) |g| {
        const parent = tree.nodes[g.parent_node].record;
        if (parent.value != .control_header or !core.hwp5.header_footer.supports(parent.value.control_header.id)) continue;
        const view = try tree.nodes[g.header_node].record.value.list_header.view(if (mode == 0) .spec6 else .observed8);
        const area = try core.hwp5.header_footer.Area.parse(view.extra);
        try int(a, &out, u32, area.width);
        try int(a, &out, u32, area.height);
        try int(a, &out, u8, area.text_references);
        try int(a, &out, u8, area.number_references);
        try int(a, &out, u32, @intCast(area.extra.len));
        try out.appendSlice(a, area.extra);
    }
    return out.toOwnedSlice(a);
}
