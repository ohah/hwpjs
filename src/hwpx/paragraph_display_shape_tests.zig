const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const shape = @import("paragraph_display_shape.zig");
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>";

test "HWPX paragraph display selects default margins and spacing without merging switch branches" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><h:paraPr id='26'><h:align horizontal='JUSTIFY'/><p:switch><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'><h:margin><c:intent value='-1130'/></h:margin><h:lineSpacing value='bad'/></p:case><p:default><h:margin><c:intent value='-2260' unit='HWPUNIT'/><c:next value='340' unit='HWPUNIT'/></h:margin><h:lineSpacing type='PERCENT' value='140' unit='HWPUNIT'/></p:default></p:switch></h:paraPr></h:head>";
    var tree = try tree_mod.parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const actual = try shape.read(a, &tree, 1);
    try std.testing.expect(actual.margins[0] != null);
    try std.testing.expectEqual(@as(?i64, -2260), actual.margins[0].?.value);
    try std.testing.expectEqual(@as(?i64, 340), actual.margins[4].?.value);
    try std.testing.expectEqual(@as(?i64, 140), actual.spacing.?.value);
    try std.testing.expectEqualStrings(source, tree.source);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: *const tree_mod.Tree) !void {
            const value = try shape.read(allocator, input, 1);
            try std.testing.expectEqual(@as(?i64, -2260), value.margins[0].?.value);
            try std.testing.expectEqual(@as(?i64, 140), value.spacing.?.value);
        }
    }.run, .{&tree});
}

test "HWPX paragraph display selected wrappers reject duplicates and preserve absent fields" {
    const a = std.testing.allocator;
    const start = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    const Case = struct { body: []const u8, expected: ?anyerror };
    for ([_]Case{
        .{ .body = "<h:paraPr id='1'><h:lineSpacing value='120'/><p:switch><p:default><h:lineSpacing value='140'/></p:default></p:switch></h:paraPr>", .expected = error.DuplicateParagraphDisplayChild },
        .{ .body = "<h:paraPr id='1'><p:switch><p:default><p:switch><p:default><h:lineSpacing value='bad'/></p:default></p:switch></p:default></p:switch></h:paraPr>", .expected = error.InvalidSignedOrUnsigned32 },
        .{ .body = "<h:paraPr id='1'><p:switch><p:case p:required-namespace='urn:unsupported'><h:lineSpacing value='bad'/></p:case></p:switch></h:paraPr>", .expected = null },
        .{ .body = "<h:paraPr id='1'><x:switch><x:default><h:lineSpacing value='bad'/></x:default></x:switch></h:paraPr>", .expected = null },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ start, case.body, "</h:head>" });
        defer a.free(source);
        var tree = try tree_mod.parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        if (case.expected) |expected| {
            try std.testing.expectError(expected, shape.read(a, &tree, 1));
        } else {
            const value = try shape.read(a, &tree, 1);
            try std.testing.expect(value.spacing == null);
            for (value.margins) |margin| try std.testing.expect(margin == null);
        }
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "HWPX paragraph display distinguishes absent zero unknown units and all allocation failures" {
    const a = std.testing.allocator;
    const source = prefix ++ "<h:paraPr id='&#48;'><h:align horizontal='FUTURE'/><h:lineSpacing type='FUTURE' value='0' unit='future'/><h:margin><c:intent value='-2147483648' unit='HWPUNIT'/><c:left value='4294967295'/><c:right/><x:prev value='bad'/></h:margin></h:paraPr><h:paraPr id='9'/></h:head>";
    var tree = try tree_mod.parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const tree_mod.Tree) !void {
            const result = try shape.read(allocator, input, 1);
            try std.testing.expectEqual(@as(u32, 0), result.id);
            try std.testing.expectEqual(@as(?i64, 0), result.spacing.?.value);
            try std.testing.expectEqual(@as(?i64, -2147483648), result.margins[0].?.value);
            try std.testing.expectEqual(@as(?i64, 4294967295), result.margins[1].?.value);
            try std.testing.expect(result.margins[2].?.value == null);
            try std.testing.expect(result.margins[3] == null);
            const unit = try result.spacing.?.unit.?.toUtf8(allocator, 4096);
            defer allocator.free(unit);
            try std.testing.expectEqualStrings("future", unit);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&tree});
    const empty = try shape.read(a, &tree, tree.elements.len - 1);
    try std.testing.expect(empty.horizontal == null and empty.spacing == null);
    for (empty.margins) |margin| try std.testing.expect(margin == null);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.InvalidElementIndex, shape.read(a, &tree, tree.elements.len));
    try std.testing.expectError(error.InvalidParagraphDisplayElement, shape.read(a, &tree, 0));
}

test "HWPX paragraph display refuses duplicate children missing IDs and invalid values" {
    const a = std.testing.allocator;
    const Case = struct { body: []const u8, expected: anyerror };
    for ([_]Case{
        .{ .body = "<h:paraPr/>", .expected = error.MissingParagraphShapeReference },
        .{ .body = "<h:paraPr id='1'><h:align/><h:align/></h:paraPr>", .expected = error.DuplicateParagraphDisplayChild },
        .{ .body = "<h:paraPr id='1'><h:margin><c:left/><c:left/></h:margin></h:paraPr>", .expected = error.DuplicateParagraphDisplayChild },
        .{ .body = "<h:paraPr id='1'><h:lineSpacing value='4294967296'/></h:paraPr>", .expected = error.InvalidSignedOrUnsigned32 },
        .{ .body = "<h:paraPr id='1'><h:margin><c:intent value='-2147483649'/></h:margin></h:paraPr>", .expected = error.InvalidSignedOrUnsigned32 },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ prefix, case.body, "</h:head>" });
        defer a.free(source);
        var tree = try tree_mod.parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, shape.read(a, &tree, 1));
    }
}
