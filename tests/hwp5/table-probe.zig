const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), t: core.hwp5.body.Table) !void {
    try int(a, out, u32, t.flags);
    try int(a, out, u16, t.row_count);
    try int(a, out, u16, t.column_count);
    try int(a, out, i16, t.cell_spacing);
    for (t.margins) |m| try int(a, out, i16, m);
    for (0..t.rows.count()) |i| try int(a, out, u16, t.rows.get(i).?.size);
    try int(a, out, u16, t.border_fill_id);
    if (t.zones) |zones| {
        try int(a, out, u16, @intCast(zones.count()));
        for (0..zones.count()) |i| {
            const z = zones.get(i).?;
            for (z.coordinates) |v| try int(a, out, u16, v);
            try int(a, out, u16, z.border_fill_id);
        }
    }
    try out.appendSlice(a, t.extra);
}
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const borders = try r.readInt(u32);
    var tree = try core.hwp5.body_tree.Tree.parse(a, bytes[r.offset..], version, .{ .max_records = limit });
    defer tree.deinit(a);
    const report = try core.hwp5.table_validation.inspect(tree, .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .border_count = borders });
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(report))) |f| try int(a, &out, u32, @intCast(@field(report, f.name)));
    for (tree.nodes, 0..) |node, i| {
        if (node.record.value != .control_header or node.record.value.control_header.id != core.hwp5.control_rules.table_id) continue;
        var lists = try core.hwp5.table_lists.Iterator.init(tree, i);
        while (lists.next()) |entry| {
            try int(a, &out, u32, @intCast(entry.node));
            try int(a, &out, u32, @intFromEnum(entry.kind));
            const raw = (try tree.nodes[entry.node].record.value.list_header.view(.observed8)).extra;
            try int(a, &out, u32, @intCast(raw.len));
            switch (entry.kind) {
                .caption => {
                    const c = try core.hwp5.body.Caption.parse(raw);
                    try int(a, &out, u32, c.flags);
                    try int(a, &out, u32, c.width);
                    try int(a, &out, i16, c.gap);
                    try int(a, &out, u32, c.max_text_width);
                    try out.appendSlice(a, c.extra);
                },
                .cell => {
                    const c = try core.hwp5.body.Cell.parse(raw);
                    inline for (.{ "column", "row", "column_span", "row_span" }) |name| try int(a, &out, u16, @field(c, name));
                    try int(a, &out, u32, c.width);
                    try int(a, &out, u32, c.height);
                    for (c.margins) |m| try int(a, &out, i16, m);
                    try int(a, &out, u16, c.border_fill_id);
                    try out.appendSlice(a, c.extra);
                },
            }
        }
    }
    return out.toOwnedSlice(a);
}
pub fn zoneFields(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version: core.hwp5.Version = .{ .raw = try r.readInt(u32) };
    const table = try core.hwp5.body.Table.parse(bytes[r.offset..], version);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (table.zones) |zones| for (0..zones.count()) |i| {
        const v = zones.get(i).?.view(.observed_row_first);
        for ([_]u16{ v.start_row, v.start_column, v.end_row, v.end_column }) |n| try int(a, &out, u32, n);
    };
    return out.toOwnedSlice(a);
}
