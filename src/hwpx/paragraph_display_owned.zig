//! Caller-owned display snapshot, independent of XML tree lifetime.
const std = @import("std");
const borrowed = @import("paragraph_display_shape.zig");
pub const Measure = struct { value: ?i64, unit: ?[]u8 };
pub const Shape = struct {
    id: u32,
    tab_pr_id: ?u32 = null,
    break_settings: ?@import("paragraph_break_settings.zig").Values = null,
    horizontal: ?[]u8 = null,
    spacing_type: ?[]u8 = null,
    spacing: ?Measure = null,
    margins: [5]?Measure = @as([5]?Measure, @splat(null)),

    pub fn deinit(self: *Shape, a: std.mem.Allocator) void {
        if (self.horizontal) |value| a.free(value);
        if (self.spacing_type) |value| a.free(value);
        if (self.spacing) |value| if (value.unit) |unit| a.free(unit);
        for (self.margins) |value| if (value) |present| if (present.unit) |unit| a.free(unit);
        self.* = undefined;
    }
};

fn measure(a: std.mem.Allocator, value: borrowed.Measure) !Measure {
    return .{ .value = value.value, .unit = if (value.unit) |unit| try unit.toUtf8(a, 4096) else null };
}

pub fn clone(a: std.mem.Allocator, source: borrowed.Shape) !Shape {
    var result: Shape = .{ .id = source.id, .tab_pr_id = source.tab_pr_id, .break_settings = source.break_settings };
    errdefer result.deinit(a);
    if (source.horizontal) |value| result.horizontal = try value.toUtf8(a, 4096);
    if (source.spacing_type) |value| result.spacing_type = try value.toUtf8(a, 4096);
    if (source.spacing) |value| result.spacing = try measure(a, value);
    for (source.margins, 0..) |value, index| if (value) |present| {
        result.margins[index] = try measure(a, present);
    };
    return result;
}

test "HWPX paragraph display owned snapshot survives tree destruction and allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:paraPr id='9'><h:breakSetting keepWithNext='0' keepLines='1'/><h:align horizontal='RIG&#72;T'/><h:lineSpacing type='PERCENT' value='0' unit='HWPUNIT'/><h:margin><c:intent value='-2' unit='HWPUNIT'/></h:margin></h:paraPr></h:head>", .header, null, 0, .{});
    var tree_live = true;
    defer if (tree_live) tree.deinit(a);
    const source = try borrowed.read(a, &tree, 1);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: borrowed.Shape) !void {
            var result = try clone(allocator, input);
            defer result.deinit(allocator);
            try std.testing.expectEqualStrings("RIGHT", result.horizontal.?);
        }
    }.run, .{source});
    var result = try clone(a, source);
    defer result.deinit(a);
    tree.deinit(a);
    tree_live = false;
    try std.testing.expectEqualStrings("RIGHT", result.horizontal.?);
    try std.testing.expectEqualStrings("PERCENT", result.spacing_type.?);
    try std.testing.expectEqual(@as(?bool, false), result.break_settings.?.keep_with_next);
    try std.testing.expectEqual(@as(?bool, true), result.break_settings.?.keep_lines);
    try std.testing.expect(result.break_settings.?.widow_orphan == null);
    try std.testing.expectEqual(@as(?i64, 0), result.spacing.?.value);
    try std.testing.expectEqual(@as(?i64, -2), result.margins[0].?.value);
    try std.testing.expect(result.margins[1] == null);
}
