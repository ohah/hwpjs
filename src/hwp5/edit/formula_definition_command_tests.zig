const std = @import("std");
const field = @import("../body/field_start.zig");
const definition = @import("formula_definition_command.zig");

fn wire(comptime value: []const u8) [value.len * 2]u8 {
    var bytes: [value.len * 2]u8 = @splat(0);
    for (value, 0..) |c, i| bytes[2 * i] = c;
    return bytes;
}

const original_command = wire("=SUM(A1:A2)??%.2f,;;999.99");
fn original() field.Properties {
    return .{ .attributes = 0x10000000, .other = 0x85, .command = &original_command, .instance_id = 0xfedcba98, .extra = &.{ 0xff, 0x80, 0 } };
}

fn owned(a: std.mem.Allocator) !void {
    const before = original();
    const bytes = try definition.prepare(a, before, &wire("AVG(B1:B4)"), 12.5, .none);
    defer a.free(bytes);
    const after = try field.Properties.parse(bytes);
    const view = try after.formulaView();
    try std.testing.expectEqualSlices(u8, &wire("AVG(B1:B4)"), view.expression);
    try std.testing.expectEqualSlices(u8, &wire("%.2f"), view.format);
    try std.testing.expectEqualSlices(u8, &wire("12.50"), view.cached_display);
    try std.testing.expectEqual(before.attributes | field.modified_mask, after.attributes);
    try std.testing.expectEqual(before.other, after.other);
    try std.testing.expectEqual(before.instance_id, after.instance_id);
    try std.testing.expectEqualSlices(u8, before.extra, after.extra);
    try std.testing.expectEqualSlices(u8, &wire("999.99"), (try before.formulaView()).cached_display);
}

test "formula definition command owns fresh result and preserves opaque properties through allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(owned, .{});
}

test "formula definition command preserves exact no-op and rejects malformed definitions and nonfinite results" {
    const a = std.testing.allocator;
    const before = original();
    const expected = try before.withCommand(a, before.command, before.attributes);
    defer a.free(expected);
    const same = try definition.prepare(a, before, &wire("SUM(A1:A2)"), 999.99, .none);
    defer a.free(same);
    try std.testing.expectEqualSlices(u8, expected, same);
    try std.testing.expectError(error.UnexpectedEnd, definition.prepare(a, before, &.{'A'}, 1, .none));
    try std.testing.expectError(error.UnsupportedFormulaExpression, definition.prepare(a, before, &wire("=SUM(A1:A2)"), 1, .none));
    try std.testing.expectError(error.UnsupportedFormulaExpression, definition.prepare(a, before, &wire("AVG(A1:A2)??%g,;;0"), 1, .none));
    try std.testing.expectError(error.InvalidFormulaNumber, definition.prepare(a, before, &wire("SUM(A1:A2)"), std.math.inf(f64), .none));
    try std.testing.expectError(error.LimitExceeded, definition.prepare(a, before, &(@as([4098]u8, @splat(0))), 1, .none));
}
