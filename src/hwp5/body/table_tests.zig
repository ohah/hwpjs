const std = @import("std");
const t = std.testing;
const body = @import("reader.zig");
const Table = body.Table;
test "table version boundary, mandatory zone count, borrowed rows and tails" {
    var b = [_]u8{0} ** 39;
    std.mem.writeInt(u16, b[4..6], 2, .little);
    std.mem.writeInt(u16, b[6..8], 3, .little);
    std.mem.writeInt(u16, b[18..20], 1, .little);
    std.mem.writeInt(u16, b[20..22], 2, .little);
    std.mem.writeInt(u16, b[24..26], 1, .little);
    const old = try Table.parse(b[0..24], .{ .raw = 0x050000ff });
    try t.expect(old.zones == null);
    try t.expectEqual(2, old.rows.count());
    try t.expectEqual(2, old.rows.get(1).?.size);
    try t.expect(old.rows.raw.ptr == b[18..22].ptr);
    try t.expect(old.rows.get(std.math.maxInt(usize)) == null);
    const modern = try Table.parse(&b, .{ .raw = 0x05000100 });
    try t.expectEqual(1, modern.zones.?.count());
    try t.expectEqual(3, modern.extra.len);
    try t.expect(modern.zones.?.raw.ptr == b[26..36].ptr);
    try t.expect(modern.zones.?.get(std.math.maxInt(usize)) == null);
    for (0..36) |n| try t.expectError(error.UnexpectedEnd, Table.parse(b[0..n], .{ .raw = 0x05000100 }));
    for (0..24) |n| try t.expectError(error.UnexpectedEnd, Table.parse(b[0..n], .{ .raw = 0x050000ff }));
    b[24] = 0;
    const empty = try Table.parse(b[0..26], .{ .raw = 0x05000100 });
    try t.expectEqual(0, empty.zones.?.count());
    const old_tail = try Table.parse(&b, .{ .raw = 0x050000ff });
    try t.expectEqualSlices(u8, b[24..], old_tail.extra);
}
test "table zone coordinate layouts remain explicit and asymmetric" {
    const zone: body.table.zone.Zone = .{ .coordinates = .{ 1, 2, 3, 4 }, .border_fill_id = 5 };
    const observed = zone.view(.observed_row_first);
    try t.expectEqual(1, observed.start_row);
    try t.expectEqual(2, observed.start_column);
    try t.expectEqual(3, observed.end_row);
    try t.expectEqual(4, observed.end_column);
    const spec = zone.view(.spec_column_first);
    try t.expectEqual(2, spec.start_row);
    try t.expectEqual(1, spec.start_column);
    try t.expectEqual(4, spec.end_row);
    try t.expectEqual(3, spec.end_column);
}
test "cell and caption fields preserve signed margins and distinct offsets" {
    var b = [_]u8{255} ** 39;
    std.mem.writeInt(u16, b[0..2], 1, .little);
    std.mem.writeInt(u16, b[2..4], 2, .little);
    std.mem.writeInt(u16, b[4..6], 3, .little);
    std.mem.writeInt(u16, b[6..8], 4, .little);
    std.mem.writeInt(u32, b[8..12], 0x80000000, .little);
    std.mem.writeInt(i16, b[16..18], -32768, .little);
    std.mem.writeInt(i16, b[18..20], 32767, .little);
    std.mem.writeInt(i16, b[20..22], 123, .little);
    const c = try body.Cell.parse(&b);
    try t.expectEqual(1, c.column);
    try t.expectEqual(2, c.row);
    try t.expectEqual(3, c.column_span);
    try t.expectEqual(4, c.row_span);
    try t.expectEqual(0x80000000, c.width);
    try t.expectEqual(0xffffffff, c.height);
    try t.expectEqualSlices(i16, &.{ -32768, 32767, 123, -1 }, &c.margins);
    try t.expectEqual(65535, c.border_fill_id);
    try t.expectEqualSlices(u8, b[26..], c.extra);
    for (0..26) |n| try t.expectError(error.UnexpectedEnd, body.Cell.parse(b[0..n]));
    const caption = try body.Caption.parse(&b);
    try t.expectEqual(0x00020001, caption.flags);
    try t.expectEqual(0x00040003, caption.width);
    try t.expectEqual(0, caption.gap);
    try t.expectEqual(0xffff8000, caption.max_text_width);
    try t.expectEqualSlices(u8, b[14..], caption.extra);
    for (0..14) |n| try t.expectError(error.UnexpectedEnd, body.Caption.parse(b[0..n]));
    const negative = [_]u8{255} ** 14;
    try t.expectEqual(-1, (try body.Caption.parse(&negative)).gap);
}
test "cell decoding uses caller chosen list layout without auto fallback" {
    var b = [_]u8{0} ** 34;
    std.mem.writeInt(u16, b[6..8], 9, .little);
    std.mem.writeInt(u16, b[8..10], 11, .little);
    std.mem.writeInt(u16, b[10..12], 13, .little);
    const header = try body.ListHeader.parse(&b);
    const spec = try body.Cell.parse((try header.view(.spec6)).extra);
    const observed = try body.Cell.parse((try header.view(.observed8)).extra);
    try t.expectEqual(9, spec.column);
    try t.expectEqual(11, spec.row);
    try t.expectEqual(11, observed.column);
    try t.expectEqual(13, observed.row);
    try t.expectEqual(2, spec.extra.len);
    try t.expectEqual(0, observed.extra.len);
}
fn validationCase(a: std.mem.Allocator) !void {
    var b = [_]u8{0} ** 102;
    const offsets = [_]usize{ 0, 28, 36, 64 };
    const words = [_]u32{ 66 | (24 << 20), 71 | (1 << 10) | (4 << 20), 77 | (2 << 10) | (24 << 20), 72 | (2 << 10) | (34 << 20) };
    for (offsets, words) |p, w| std.mem.writeInt(u32, b[p..][0..4], w, .little);
    std.mem.writeInt(u32, b[32..36], @import("control_rules.zig").table_id, .little);
    b[44] = 1; // row count
    b[46] = 1; // column count
    b[58] = 1; // row size
    b[80] = 1; // column span
    b[82] = 1; // row span
    var tree = try @import("tree.zig").Tree.parse(a, &b, .{ .raw = 0x05000100 }, .{});
    defer tree.deinit(a);
    const inspect = @import("table_validation.zig").inspect;
    const options: @import("table_validation.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .border_count = 0 };
    const report = try inspect(tree, options);
    try t.expectEqual(1, report.tables);
    try t.expectEqual(1, report.cells);
    var it = try @import("table_lists.zig").Iterator.init(tree, 1);
    try t.expectEqual(2, it.table_node);
    const entry = it.next().?;
    try t.expectEqual(3, entry.node);
    try t.expectEqual(.cell, entry.kind);
    try t.expect(it.next() == null);
    try t.expectError(error.InvalidTableOwner, @import("table_lists.zig").Iterator.init(tree, std.math.maxInt(usize)));
    try t.expectError(error.InvalidTableOwner, @import("table_lists.zig").Iterator.init(tree, 0));
    // Mutate borrowed payload after a successful pass; late validation must not leak.
    b[80] = 0;
    try t.expectError(error.InvalidCellSpan, inspect(tree, options));
}
test "table owner traversal and all tree allocation failures clean up" {
    try t.checkAllAllocationFailures(t.allocator, validationCase, .{});
}
