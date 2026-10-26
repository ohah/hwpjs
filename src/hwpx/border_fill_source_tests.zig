const std = @import("std");
const t = std.testing;
const source = @import("border_fill_source.zig");
const header = @import("header_tree.zig");
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:f='urn:foreign'><h:refList><h:borderFills>";
const suffix = "</h:borderFills></h:refList></h:head>";
test "border fill source owns exact selected brush colors after header release" {
    var value = blk: {
        var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4'><c:fillBrush><c:winBrush faceColor='#123456' alpha='0'/></c:fillBrush></h:borderFill><h:borderFill id='5'><c:fillBrush><c:winBrush alpha='not-a-number'/></c:fillBrush></h:borderFill>" ++ suffix, 0, .{});
        defer tree.deinit(t.allocator);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(a: std.mem.Allocator, input: *const header.Tree) !void {
                var selected = try source.read(a, input, 4);
                defer selected.deinit();
                try t.expectEqualStrings("#123456", selected.fill_report.?.nodes[0].get(.face_color).?);
            }
        }.run, .{&tree});
        break :blk try source.read(t.allocator, &tree, 4);
    };
    defer value.deinit();
    const report = value.fill_report.?;
    try t.expectEqual(@as(usize, 1), report.brushes.len);
    try t.expectEqual(@as(usize, 1), report.nodes.len);
    try t.expectEqual(value.node, report.brushes[0].parent_element_index.?);
    try t.expectEqualStrings("#123456", report.nodes[0].get(.face_color).?);
    try t.expectEqualStrings("0", report.nodes[0].get(.win_alpha).?);
}

test "border fill source keeps absence unknown values namespaces and owned allocation safety" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4' threeD='0'><h:leftBorder type='NONE' width='0.12 mm' color='#000000'/><h:diagonal type='SOLID'/><h:slash type='NONE'/><f:rightBorder type='SOLID'/><c:fillBrush/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, input: *const header.Tree) !void {
            var value = try source.read(a, input, 4);
            defer value.deinit();
            try t.expectEqualStrings("NONE", value.edges[0].?.style.?);
            try t.expectEqualStrings("0.12 mm", value.edges[0].?.width.?);
            try t.expect(value.edges[1] == null);
            try t.expect(value.shadow == null);
            try t.expectEqualStrings("SOLID", value.diagonal.?.style.?);
            try t.expectEqualStrings("NONE", value.slash.?);
            try t.expect(value.fill_node != null);
            try t.expectEqual(@as(usize, 1), value.fill_report.?.brushes.len);
            try t.expectEqual(value.fill_node.?, value.fill_report.?.brushes[0].element_index);
            try t.expectEqual(@as(usize, 1), value.unknown_children);
        }
    }.run, .{&tree});
}
test "border fill source refuses duplicate ids children and missing references" {
    inline for (.{ .{ "<h:borderFill id='4'/><h:borderFill id='4'/>", error.DuplicateBorderFillId }, .{ "<h:borderFill id='4'><h:leftBorder/><h:leftBorder/></h:borderFill>", error.DuplicateBorderFillChild }, .{ "<h:borderFill id='5'/>", error.MissingBorderFillId } }) |case| {
        var tree = try header.parse(t.allocator, prefix ++ case[0] ++ suffix, 0, .{});
        defer tree.deinit(t.allocator);
        try t.expectError(case[1], source.read(t.allocator, &tree, 4));
    }
}
test "border fill source is detached and retains empty child unknown spelling and decoded entities" {
    var value = blk: {
        var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4' shadow='FUTURE' future='1'><h:leftBorder type='N&#79;NE' width='0.12345 mm'/><h:slash/><h:backSlash type='FUTURE'/></h:borderFill>" ++ suffix, 0, .{});
        defer tree.deinit(t.allocator);
        break :blk try source.read(t.allocator, &tree, 4);
    };
    defer value.deinit();
    try t.expectEqualStrings("NONE", value.edges[0].?.style.?);
    try t.expectEqualStrings("0.12345 mm", value.edges[0].?.width.?);
    try t.expectEqualStrings("FUTURE", value.shadow.?);
    try t.expect(value.slash == null and value.slash_node != null);
    try t.expectEqualStrings("FUTURE", value.back_slash.?);
    try t.expect(value.back_slash_node != null);
    try t.expect(value.edges[0].?.color == null);
    try t.expect(value.three_d == null);
    try t.expectEqual(@as(usize, 1), value.unknown_attributes);
}

test "border fill source refuses duplicate containers and ignores foreign attribute lookalikes" {
    var duplicate = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4'/>" ++ "</h:borderFills><h:borderFills>" ++ suffix, 0, .{});
    defer duplicate.deinit(t.allocator);
    try t.expectError(error.DuplicateBorderFills, source.read(t.allocator, &duplicate, 4));
    var foreign = try header.parse(t.allocator, prefix ++ "<h:borderFill f:id='4'/>" ++ suffix, 0, .{});
    defer foreign.deinit(t.allocator);
    try t.expectError(error.MissingBorderFillId, source.read(t.allocator, &foreign, 4));
}
