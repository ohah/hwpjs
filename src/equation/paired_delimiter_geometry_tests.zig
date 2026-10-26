const std = @import("std");
const t = std.testing;
const g = @import("paired_delimiter_geometry.zig");
const tokens = @import("delimiter_tokens.zig");
test "equation paired geometry encloses independently chosen ends and every decimal stroke" {
    const names = [_][]const u8{ "(", ")", "[", "]", "{", "}", "<", ">", "|", "VERT", "." };
    for (1..129) |index| {
        const unit = @as(f64, @floatFromInt(index)) / 10;
        for (names) |left| for (names) |right| {
            const result = try g.place(.{ .width = unit * 3, .ascent = unit * 2, .descent = unit / 3 }, tokens.resolve(left).?, tokens.resolve(right).?, .{ .width = unit * 0.4, .gap = unit * 0.15, .thickness = unit * 0.05 }, .{});
            try t.expect(result.body.x + result.body.box.width <= result.box.width);
            for (result.curves[0..result.curve_count]) |curve| for (curve.points) |point| {
                const half = curve.thickness / 2;
                try t.expect(point.x - half >= 0 and point.x + half <= result.box.width);
                try t.expect(point.y - half >= -result.box.ascent and point.y + half <= result.box.descent);
            };
            for (result.rectangles[0..result.rectangle_count]) |rect| {
                try t.expect(rect.x >= 0 and rect.x + rect.width <= result.box.width);
                try t.expect(rect.y >= -result.box.ascent and rect.y + rect.height <= result.box.descent);
            }
            if (std.mem.eql(u8, left, ".") and std.mem.eql(u8, right, ".")) {
                try t.expectEqual(@as(f64, 0), result.body.x);
                try t.expectEqual(result.body.box, result.box);
                try t.expectEqual(@as(usize, 0), result.curve_count + result.rectangle_count);
            }
        };
    }
}
test "equation paired geometry ignores the unused end and rejects invalid metrics" {
    const params: @import("delimiter_geometry.zig").Parameters = .{ .width = 0.4, .gap = 0.15, .thickness = 0.05 };
    const result = try g.place(.{ .width = 9.2, .ascent = 1, .descent = 1 }, tokens.resolve(".").?, tokens.resolve("]").?, params, .{ .max_extent = 10 });
    try t.expectEqual(@as(usize, 3), result.rectangle_count);
    try t.expect(result.box.width <= 10);
    try t.expectError(error.InvalidEquationLayoutMetric, g.place(.{ .width = 1, .ascent = 1, .descent = 1 }, tokens.resolve("(").?, tokens.resolve(")").?, .{ .width = 0.4, .gap = 0.1, .thickness = 0 }, .{}));
}
