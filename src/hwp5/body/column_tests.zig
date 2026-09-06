const std = @import("std");
const t = std.testing;
const D = @import("column_def.zig").Definition;
test "column branches distinguish absent spacing and unsigned wire pairs" {
    var bytes = [_]u8{255} ** 18;
    std.mem.writeInt(u16, bytes[0..2], 8, .little);
    const d = try D.parse(&bytes);
    try t.expect(d.spacing == null);
    try t.expectEqual(2, d.count());
    try t.expectEqual(65535, d.flags_high);
    try t.expectEqual(65535, d.columns.?.get(0).?.width);
    try t.expectEqual(65535, d.columns.?.get(1).?.gap);
    try t.expect(d.columns.?.get(2) == null);
    try t.expect(d.columns.?.get(std.math.maxInt(usize)) == null);
    std.mem.writeInt(u16, bytes[0..2], 0x1004, .little);
    const same = try D.parse(&bytes);
    try t.expectEqual(-1, same.spacing.?);
    try t.expect(same.columns == null);
    try t.expectEqual(6, same.extra.len);
    try t.expectEqual(0xffff1004, same.flags());
    bytes[0] = 4;
    bytes[1] = 0;
    const single = try D.parse(&bytes);
    try t.expect(!single.sameWidth() and single.columns == null);
    bytes[0] = 0;
    try t.expectError(error.InvalidColumnCount, D.parse(&bytes));
}
