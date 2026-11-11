//! Independent synthetic oracle: official HWP5 record framing and fixed fields.
//! No fixture, reference implementation or shared coordinate-plan expectations.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const wire = @import("../record.zig");
const writer = @import("../record_writer.zig");
const Layout = @import("../body/list_header.zig").Layout;
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
const a = std.testing.allocator;
pub const version = @import("../version.zig").Version{ .raw = 0x05000302 };
const budget = 16384;
const fresh = [_]u32{ 901, 902 };
pub const Mutation = enum { none, protected_cell, protected_last_cell, other_attributes, merged, extra_cell, extra_table, zones, caption, nested, cache, unknown_child, tracking };
fn put(comptime T: type, bytes: []u8, at: usize, value: T) void {
    std.mem.writeInt(T, bytes[at..][0..@sizeOf(T)], value, .little);
}
fn header(id: u32, units: u32) [24]u8 {
    var b: [24]u8 = @splat(0);
    put(u32, &b, 0, 0x80000000 | units);
    put(u16, &b, 8, @intCast(id % 7));
    b[10] = @intCast(id % 5);
    put(u16, &b, 12, 2);
    put(u32, &b, 18, id);
    put(u16, &b, 22, 0);
    return b;
}
pub fn fixture(layout: Layout, mutation: Mutation) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var host = header(700, 1);
    put(u16, &host, 12, 1);
    try writer.append(a, &out, 66, 0, &host, budget);
    try writer.append(a, &out, 67, 1, &.{ 13, 0 }, budget);
    try writer.append(a, &out, 68, 1, &(@as([8]u8, @splat(0))), budget);
    // Unknown non-target record must survive byte-for-byte.
    try writer.append(a, &out, 900, 1, "prefix opaque", budget);
    var common: [46]u8 = @splat(0);
    put(u32, &common, 0, 0x74626c20); // official 'tbl ' control ID
    put(u32, &common, 4, 0x6a2211);
    put(i32, &common, 8, -19);
    put(u32, &common, 16, 101);
    put(u32, &common, 20, 34);
    put(u32, &common, 36, 800);
    try writer.append(a, &out, 71, 1, &common, budget);
    if (mutation == .caption) {
        var caption: [30]u8 = @splat(0);
        put(u16, &caption, 0, 1);
        try writer.append(a, &out, 72, 2, &caption, budget);
        var ch = header(777, 1);
        put(u16, &ch, 12, 1);
        try writer.append(a, &out, 66, 2, &ch, budget);
        try writer.append(a, &out, 67, 3, &.{ 13, 0 }, budget);
        try writer.append(a, &out, 68, 3, &(@as([8]u8, @splat(0))), budget);
    }
    var table: [36]u8 = @splat(0);
    put(u32, &table, 0, 5);
    put(u16, &table, 4, 2);
    put(u16, &table, 6, 2);
    put(u16, &table, 10, 3);
    put(u16, &table, 18, 2);
    put(u16, &table, 20, 2);
    put(u16, &table, 22, 9);
    if (mutation == .zones) put(u16, &table, 24, 1);
    const table_len: usize = if (mutation == .zones) 36 else if (mutation == .extra_table) 27 else 26;
    try writer.append(a, &out, 77, 2, table[0..table_len], budget);
    for (0..4) |i| {
        var cell: [35]u8 = @splat(0);
        put(u16, &cell, 0, 1);
        const base: usize = if (layout == .spec6) 6 else 8;
        const attr: usize = if (layout == .spec6) 2 else 4;
        if (layout == .observed8) put(u16, &cell, 2, 0x1234);
        put(u32, &cell, attr, @intCast(0x20 + i));
        // Independent wire input; production protection semantics belong to CellAttributes.
        if (mutation == .protected_cell and i == 0) put(u32, &cell, attr, 0x20 | (1 << 17));
        if (mutation == .protected_last_cell and i == 3) put(u32, &cell, attr, 0x23 | (1 << 17));
        if (mutation == .other_attributes) put(u32, &cell, attr, @as(u32, @intCast(0x20 + i)) | 0x800d0000);
        put(u16, &cell, base, @intCast(i % 2));
        put(u16, &cell, base + 2, @intCast(i / 2));
        put(u16, &cell, base + 4, if (mutation == .merged and i == 0) 2 else 1);
        put(u16, &cell, base + 6, 1);
        put(u32, &cell, base + 8, if (i % 2 == 0) 51 else 50);
        put(u32, &cell, base + 12, 17);
        put(u16, &cell, base + 16, @intCast(i + 1));
        put(u16, &cell, base + 24, @intCast(i + 2));
        try writer.append(a, &out, 72, 2, cell[0 .. base + 26 + @intFromBool(mutation == .extra_cell and i == 0)], budget);
        var h = header(@intCast(101 + i), 4);
        if (mutation == .tracking and i == 0) put(u16, &h, 22, 1);
        if (mutation == .cache and i == 0) put(u16, &h, 16, 1);
        try writer.append(a, &out, 66, 2, &h, budget);
        // Distinct letter + surrogate pair + paragraph terminator.
        var text = [_]u8{ @intCast(65 + i), 0, 0x3d, 0xd8, 0x00, 0xde, 13, 0 };
        try writer.append(a, &out, 67, 3, &text, budget);
        var runs: [16]u8 = @splat(0);
        put(u32, &runs, 4, @intCast(10 + i));
        put(u32, &runs, 8, 1);
        put(u32, &runs, 12, @intCast(20 + i));
        try writer.append(a, &out, 68, 3, &runs, budget);
        if (i == 0) switch (mutation) {
            .nested => try writer.append(a, &out, 71, 3, &common, budget),
            .unknown_child => try writer.append(a, &out, 900, 3, "opaque cell", budget),
            .cache => try writer.append(a, &out, 69, 3, &(@as([36]u8, @splat(0))), budget),
            else => {},
        };
    }
    var tail = header(701, 1);
    put(u16, &tail, 12, 1);
    try writer.append(a, &out, 66, 0, &tail, budget);
    try writer.append(a, &out, 67, 1, &.{ 13, 0 }, budget);
    try writer.append(a, &out, 68, 1, &(@as([8]u8, @splat(0))), budget);
    try writer.append(a, &out, 901, 0, "tail opaque", budget);
    return out.toOwnedSlice(a);
}
