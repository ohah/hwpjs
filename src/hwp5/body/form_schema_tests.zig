const std = @import("std");
const t = std.testing;
const rules = @import("form_schema_rules.zig");
const schema = @import("form_schema.zig");
const refs = @import("form_references.zig");
const Tree = @import("form_property_tree.zig").Tree;
fn wide(comptime ascii: []const u8) [ascii.len * 2]u8 {
    var result = [_]u8{0} ** (ascii.len * 2);
    for (ascii, 0..) |c, i| result[i * 2] = c;
    return result;
}
test "form schema table has unique reachable paths and fields for every supported kind" {
    var covered: [rules.field_count]bool = @splat(false);
    for (rules.rules, 0..) |rule, i| {
        covered[@intFromEnum(rule.field)] = true;
        for (rules.rules[i + 1 ..]) |other| {
            if (rule.types & other.types == 0) continue;
            try t.expect(rule.field != other.field);
            try t.expect(rule.scope != other.scope or !std.mem.eql(u8, rule.key, other.key));
        }
    }
    for (covered) |present| try t.expect(present);
    try t.expect(!rules.equals(&.{ 'N', 0, 'a' }, "N"));
    try t.expect(!rules.equals(&.{ 'N', 1 }, "N"));
}
test "stored form references keep missing distinct and reject fixed width overflow on all targets" {
    inline for (.{ "0", "0001", "4294967295", "4294967296", "18446744073709551616", "-0", "-1" }) |value| {
        const body = "CharShapeID:int:" ++ value ++ " ";
        const bytes = wide(std.fmt.comptimePrint("CharShapeSet:set:{d}:{s}", .{ body.len, body }));
        var tree = try Tree.parseObservedUnits(t.allocator, &bytes, .{});
        defer tree.deinit(t.allocator);
        const report = try schema.inspectObserved(tree, .edit);
        try t.expectEqual(@as(usize, 2), report.known_nodes);
        const result = refs.storedCharShapeObserved(tree, report, 2);
        if (value[0] == '-') {
            try t.expectError(error.InvalidFormCharShapeId, result);
        } else if (value.len > 10 or std.mem.eql(u8, value, "4294967296")) {
            try t.expectError(error.FormCharShapeIdOverflow, result);
        } else if (std.mem.eql(u8, value, "4294967295")) {
            try t.expect((try result) == .invalid);
        } else {
            try t.expectEqual(if (value.len == 1) @as(usize, 0) else 1, (try result).ordinal);
        }
        try t.expectEqualSlices(u8, &wide(value), report.get(tree, .char_shape_id).?.value);
    }
    var empty = try Tree.parseObservedUnits(t.allocator, &.{}, .{});
    defer empty.deinit(t.allocator);
    try t.expect((try refs.storedCharShapeObserved(empty, try schema.inspectObserved(empty, .edit), 0)) == .absent);
}
