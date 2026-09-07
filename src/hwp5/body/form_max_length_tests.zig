const std = @import("std");
const t = std.testing;
const Tree = @import("form_property_tree.zig").Tree;
const schema = @import("form_schema.zig");
const length = @import("form_max_length.zig");
fn wide(comptime ascii: []const u8) [ascii.len * 2]u8 {
    var out = [_]u8{0} ** (ascii.len * 2);
    for (ascii, 0..) |c, i| out[i * 2] = c;
    return out;
}
test "form MaxLength preserves arbitrary decimal magnitude and original bytes after Tree release" {
    inline for (.{ "-1", "-0001", "-0", "-2", "0", "0001", "2147483648", "18446744073709551615", "18446744073709551616", "0" ** 128 ++ "1", "9" ** 128 }) |value| {
        const body = "MaxLength:int:" ++ value ++ " ";
        const bytes = wide(std.fmt.comptimePrint("EditSet:set:{d}:{s} ", .{ body.len, body }));
        var tree = try Tree.parseObservedUnits(t.allocator, &bytes, .{});
        const view = length.inspectObserved(tree, try schema.inspectObserved(tree, .edit), .edit);
        tree.deinit(t.allocator);
        try t.expectEqualSlices(u8, &wide(value), view.raw.?);
        const negative = value[0] == '-';
        try t.expectEqual(if (!negative) length.State.nonnegative else if (std.mem.eql(u8, value, "-1") or std.mem.eql(u8, value, "-0001")) length.State.unlimited else length.State.deferred, view.state);
        for ([_]u64{ 0, 1, 2147483648, std.math.maxInt(u64) }) |count| {
            if (negative) {
                try t.expectEqual(@as(?std.math.Order, null), view.compareCount(count));
            } else {
                const expected = if (std.fmt.parseInt(u64, value, 10)) |n| std.math.order(count, n) else |_| std.math.Order.lt;
                try t.expectEqual(expected, view.compareCount(count).?);
            }
        }
    }
}
test "MaxLength does not borrow a wrong scope or guess an absent default" {
    inline for (.{ "", "MaxLength:int:-1 ", "Other:set:17:MaxLength:int:-1  " }) |text| {
        const bytes = wide(text);
        var tree = try Tree.parseObservedUnits(t.allocator, &bytes, .{});
        defer tree.deinit(t.allocator);
        const view = length.inspectObserved(tree, try schema.inspectObserved(tree, .edit), .edit);
        try t.expectEqual(length.State.missing, view.state);
        try t.expectEqual(@as(?[]const u8, null), view.raw);
        try t.expectEqual(@as(?std.math.Order, null), view.compareCount(0));
        try t.expectEqual(length.State.not_applicable, length.inspectObserved(tree, try schema.inspectObserved(tree, .combo_box), .combo_box).state);
    }
}
