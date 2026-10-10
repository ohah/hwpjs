const std = @import("std");
const underline = @import("character_underline_values.zig");
const parse = @import("xml_part_tree.zig").parse;

test "HWPX underline values preserve CENTER absence namespaces and owned strings" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr><f:underline type='TOP'/><f:holder><h:underline type='TOP'/></f:holder><h:underline type='CEN&#84;ER' shape='WAVE' color='#123456'/></h:charPr><h:charPr/><h:charPr><h:underline type='NONE'/></h:charPr></h:head>";
    var tree = try parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    var center = try underline.read(a, &tree, 1, 64);
    defer center.deinit(a);
    try std.testing.expect(center.present);
    try std.testing.expectEqual(underline.Kind.center, center.kind.?);
    try std.testing.expectEqualStrings("WAVE", center.shape.?);
    try std.testing.expectEqualStrings("#123456", center.color.?);
    center.shape.?[0] = 'X';
    var fresh = try underline.read(a, &tree, 1, 64);
    defer fresh.deinit(a);
    try std.testing.expectEqualStrings("WAVE", fresh.shape.?);
    var absent = try underline.read(a, &tree, 6, 64);
    defer absent.deinit(a);
    try std.testing.expect(!absent.present and absent.kind == null);
    var none = try underline.read(a, &tree, 7, 64);
    defer none.deinit(a);
    try std.testing.expect(none.present and none.kind == .none and none.shape == null and none.color == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            var values = try underline.read(allocator, input, 1, 64);
            defer values.deinit(allocator);
            try std.testing.expectEqual(underline.Kind.center, values.kind.?);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, underline.read(a, &tree, 1, 1));
}

test "HWPX underline values reject duplicate unknown kind invalid owner and limits" {
    const a = std.testing.allocator;
    const Case = struct { body: []const u8, expected: anyerror };
    for ([_]Case{
        .{ .body = "<h:underline/><h:underline/>", .expected = error.DuplicateCharacterUnderline },
        .{ .body = "<h:underline type='FUTURE'/>", .expected = error.InvalidCharacterUnderlineKind },
    }) |case| {
        const source = try std.mem.concat(a, u8, &.{ "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr>", case.body, "</h:charPr></h:head>" });
        defer a.free(source);
        var tree = try parse(a, source, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, underline.read(a, &tree, 1, 64));
        try std.testing.expectError(error.InvalidCharacterShapeElement, underline.read(a, &tree, 0, 64));
        try std.testing.expectError(error.InvalidElementIndex, underline.read(a, &tree, tree.elements.len, 64));
        tree.part_kind = .section;
        try std.testing.expectError(error.InvalidPartKind, underline.read(a, &tree, 1, 64));
    }
}
