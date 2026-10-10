const std = @import("std");

test "original numeric ABOVE SUM AVG PRODUCT reproduce independent cached values without using cache" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/calc-cell.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var count: usize = 0;
    for (tree.nodes) |node| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("control_rules.zig").id("%fmu")) continue;
        const properties = try @import("field_start.zig").Properties.parse(node.record.value.control_header.properties);
        const view = try properties.formulaView();
        const range = try view.range();
        const owner = try @import("formula_cell.zig").locate(tree, groups, node.parent.?, .observed8);
        const result = try @import("formula_values.zig").evaluate(tree, groups, owner, range, .observed8, .{});
        const expected: f64 = if (range.address_count != 0) 13 else switch (range.function) {
            .average => 2,
            .product => 14,
            .sum => 5,
        };
        try std.testing.expectEqual(expected, result.value);
        try std.testing.expectEqual(@as(usize, if (range.address_count != 0) 3 else 2), result.cells);
        if (range.function == .product) {
            const Reader = struct {
                value: f64,
                pub fn read(self: @This(), _: @import("tree.zig").Tree, _: @import("list_groups.zig").Group) !f64 {
                    return self.value;
                }
            };
            const values = @import("formula_values.zig");
            try std.testing.expectEqual(@as(f64, 4), (try values.evaluateWith(tree, groups, owner, range, .observed8, .{}, Reader{ .value = -2 })).value);
            try std.testing.expectEqual(@as(f64, 0), (try values.evaluateWith(tree, groups, owner, range, .observed8, .{}, Reader{ .value = 0 })).value);
            try std.testing.expectError(error.FormulaNumericOverflow, values.evaluateWith(tree, groups, owner, range, .observed8, .{}, Reader{ .value = std.math.floatMax(f64) }));
            try std.testing.expectError(error.LimitExceeded, values.evaluate(tree, groups, owner, range, .observed8, .{ .cells = 1 }));
        }
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), count);
}
