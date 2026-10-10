//! Pending scalar matrix coefficients bound to immutable source nodes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("picture_matrix_fields.zig");
pub const Entry = struct { matrix_node: usize, values: [6]f64 };
pub const Values = std.ArrayList(Entry);

pub fn read(a: std.mem.Allocator, tree: *const Tree, values: *const Values, node: usize) ![6]?f64 {
    var result = try fields.read(a, tree, node);
    for (values.items) |entry| if (entry.matrix_node == node) {
        for (entry.values, 0..) |value, index| result[index] = value;
        break;
    };
    return result;
}

pub fn set(a: std.mem.Allocator, tree: *const Tree, values: *Values, node: usize, requested: [6]f64, limit: usize) !bool {
    const tag = try @import("picture_matrix_write.zig").write(a, tree, node, requested, limit);
    defer a.free(tag);
    const raw = try fields.read(a, tree, node);
    var original: [6]f64 = undefined;
    for (raw, 0..) |value, index| original[index] = value orelse return error.MissingXmlNumericAttribute;
    for (values.items, 0..) |*entry, index| {
        if (entry.matrix_node != node) continue;
        if (std.meta.eql(entry.values, requested)) return false;
        if (std.meta.eql(original, requested)) {
            _ = values.orderedRemove(index);
        } else entry.values = requested;
        return true;
    }
    if (std.meta.eql(original, requested)) return false;
    if (values.items.len >= 100000) return error.LimitExceeded;
    try values.append(a, .{ .matrix_node = node, .values = requested });
    return true;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:renderingInfo><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .empty;
    defer values.deinit(a);
    const original: [6]f64 = .{ 1, 0, 0, 0, 1, 0 };
    const changed: [6]f64 = .{ 2, 0, 0, 0, 3, 0 };
    try std.testing.expect(!try set(a, &tree, &values, 2, original, 4096));
    try std.testing.expect(try set(a, &tree, &values, 2, changed, 4096));
    try std.testing.expect(!try set(a, &tree, &values, 2, changed, 4096));
    try std.testing.expectEqualDeep(changed, values.items[0].values);
    try std.testing.expectEqualDeep([6]?f64{ 2, 0, 0, 0, 3, 0 }, try read(a, &tree, &values, 2));
    try std.testing.expect(try set(a, &tree, &values, 2, original, 4096));
    try std.testing.expectEqual(@as(usize, 0), values.items.len);
    try std.testing.expectEqualStrings(input, tree.source);
}
test "picture matrix edit values remove original restoration and clean every allocation failure" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
