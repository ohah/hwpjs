const std = @import("std");
const settings = @import("chart_plot_settings.zig");
const tree_module = @import("chart_tree.zig");
const prefix = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart' xmlns:x='urn:foreign'><c:chart><c:plotArea>";
const suffix = "</c:plotArea></c:chart></c:chartSpace>";

test "chart stock settings preserve absent wrappers empty gap zero and maximum with allocation failures" {
    const a = std.testing.allocator;
    inline for (.{ "", "<c:hiLowLines/><c:upDownBars><c:gapWidth/><c:upBars/><c:downBars/></c:upDownBars>", "<c:upDownBars><c:gapWidth val='0'/><x:gapWidth val='bad'/></c:upDownBars>", "<c:upDownBars><c:gapWidth val='500'/></c:upDownBars>" }, 0..) |body, index| {
        var tree = try tree_module.parse(a, prefix ++ "<c:stockChart>" ++ body ++ "</c:stockChart>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const tree_module.Tree) !void {
                var value = try settings.read(allocator, source, 3, .{});
                defer value.deinit(allocator);
                const stock = value.stock.?;
                switch (index) {
                    0 => try std.testing.expect(stock.high_low_node == null and stock.up_down_node == null and stock.gap_width == null),
                    1 => try std.testing.expect(stock.high_low_node != null and stock.up_down_node != null and stock.up_node != null and stock.down_node != null and stock.gap_width.?.value == null),
                    2 => try std.testing.expectEqual(@as(?u32, 0), stock.gap_width.?.value),
                    3 => try std.testing.expectEqual(@as(?u32, 500), stock.gap_width.?.value),
                    else => unreachable,
                }
            }
        }.run, .{&tree});
    }
}

test "chart stock settings reject duplicate misplaced and invalid gap fields" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<c:hiLowLines/><c:hiLowLines/>", error.DuplicateChartStockSetting },
        .{ "<c:upDownBars/><c:upDownBars/>", error.DuplicateChartStockSetting },
        .{ "<c:upDownBars><c:gapWidth/><c:gapWidth/></c:upDownBars>", error.DuplicateChartStockSetting },
        .{ "<c:upDownBars><c:upBars/><c:upBars/></c:upDownBars>", error.DuplicateChartStockSetting },
        .{ "<c:upDownBars><c:downBars/><c:downBars/></c:upDownBars>", error.DuplicateChartStockSetting },
        .{ "<c:upBars/>", error.InvalidChartStockSetting },
        .{ "<c:upDownBars><c:gapWidth val='501'/></c:upDownBars>", error.InvalidChartStockSetting },
        .{ "<c:upDownBars><c:gapWidth val='-1'/></c:upDownBars>", error.InvalidNonNegativeInteger },
        .{ "<c:upDownBars><c:gapWidth><c:ext/></c:gapWidth></c:upDownBars>", error.InvalidChartStockSetting },
    }) |case| {
        var tree = try tree_module.parse(a, prefix ++ "<c:stockChart>" ++ case[0] ++ "</c:stockChart>" ++ suffix, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], settings.read(a, &tree, 3, .{}));
    }
    var tree = try tree_module.parse(a, prefix ++ "<c:stockChart><c:upDownBars><c:gapWidth val='150'/></c:upDownBars></c:stockChart>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, settings.read(a, &tree, 3, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.InvalidChartPlot, @import("chart_stock_settings.zig").read(a, &tree, 0, 4096));
}
