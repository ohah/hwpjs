const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const shape = @import("paragraph_display_shape.zig");
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>";

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
