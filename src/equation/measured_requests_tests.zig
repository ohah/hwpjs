const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");

test "equation measured requests reject missing swapped duplicate and invalid host metrics" {
    var tree = try parser.parse(t.allocator, "x+y", .{});
    defer tree.deinit();
    var plan = try planner.build(t.allocator, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    var values = [_]measured.Measurement{
        .{ .request = 0, .box = .{ .width = 10, .ascent = 12, .descent = 3 } },
        .{ .request = 1, .box = .{ .width = 11, .ascent = 9, .descent = 0 } },
        .{ .request = 2, .box = .{ .width = 10, .ascent = 12, .descent = 3 } },
    };
    try measured.validate(&plan, &values, .{});
    try t.expectError(error.EquationMeasurementCountMismatch, measured.validate(&plan, values[0..2], .{}));
    values[1].request = 0;
    try t.expectError(error.EquationMeasurementOrderMismatch, measured.validate(&plan, &values, .{}));
    values[1].request = 2;
    values[2].request = 1;
    try t.expectError(error.EquationMeasurementOrderMismatch, measured.validate(&plan, &values, .{}));
    values[1].request = 1;
    values[2].request = 2;
    for ([_]f64{ -1, std.math.nan(f64), std.math.inf(f64) }) |invalid| {
        values[2].box.width = invalid;
        try t.expectError(error.InvalidEquationLayoutMetric, measured.validate(&plan, &values, .{}));
    }
    values[2].box.width = 10;
    try t.expectError(error.EquationLayoutLimitExceeded, measured.validate(&plan, &values, .{ .max_extent = 14 }));
    // Zero advance is legitimate for combining glyphs; do not invent a width.
    values[2].box = .{ .width = 0, .ascent = 0, .descent = 0 };
    try measured.validate(&plan, &values, .{});
}
