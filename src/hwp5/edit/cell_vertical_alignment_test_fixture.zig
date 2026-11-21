//! hwpjs-owned decoded section. No external document or expected JSON.
const std = @import("std");
pub const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };
pub fn make(a: std.mem.Allocator) ![]u8 {
    const ids = [_]u32{ 2, 3, 4, 5 };
    var table = try @import("../../model/created_table.zig").create(a, 1, 6, try @import("../../model/table_creation_plan.zig").create(2, 2, 20000, 4000, 4), &ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    const options: @import("created_table_records.zig").Options = .{
        .common = .{ .flags = 0x6a2211, .offset_y = 0, .offset_x = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 7, .attributes = 0, .margins = .{ 11, 12, 13, 14 } },
    };
    const resources: @import("created_table_records.zig").Resources = .{ .paragraphs = .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 }, .border_count = 1 };
    const fragment = try @import("created_table_records.zig").write(a, &table, version, options, resources, 1, .{ .max_cells = 4, .max_bytes = 100000 });
    defer a.free(fragment);
    var section: std.ArrayList(u8) = .empty;
    errdefer section.deinit(a);
    var header: [24]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 0x80000009, .little);
    std.mem.writeInt(u32, header[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u32, header[18..22], 1, .little);
    const framing = @import("../record_writer.zig");
    try framing.append(a, &section, 66, 0, &header, 100000);
    var anchor: [18]u8 = @splat(0);
    std.mem.writeInt(u16, anchor[0..2], 11, .little);
    std.mem.writeInt(u32, anchor[2..6], @import("../body/control_rules.zig").table_id, .little);
    std.mem.writeInt(u16, anchor[14..16], 11, .little);
    std.mem.writeInt(u16, anchor[16..18], 13, .little);
    try framing.append(a, &section, 67, 1, &anchor, 100000);
    try framing.append(a, &section, 68, 1, &.{ 0, 0, 0, 0, 0, 0, 0, 0 }, 100000);
    try section.appendSlice(a, fragment);
    return section.toOwnedSlice(a);
}
