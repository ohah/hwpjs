const std = @import("std");
const probe = @import("ole_outside_margin_domain.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";
fn observed(a: std.mem.Allocator) !void {
    const source = prefix ++ "<p:ole lock='0'><p:sz protect='1'/><p:outMargin left='0' right='4294967295' top='-2147483648'/></p:ole>" ++ suffix;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const report = try @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, 3);
    try std.testing.expectEqualDeep([4]?i64{ 0, 4294967295, -2147483648, null }, report.values);
    try std.testing.expectEqualDeep([4]probe.Domain{ .official_model_unsigned32, .official_model_unsigned32, .observed_signed32, .absent }, report.domains);
    try std.testing.expectEqual(@as(?bool, false), report.lock);
    try std.testing.expectEqual(@as(?bool, true), report.size_protect);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "OLE margin domain preserves zero signed highbit absence and protection with allocation cleanup" {
    try observed(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(observed, .{});
}
test "OLE margin domain never invents absent protection flags" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:ole/>" ++ suffix, 0, 0, .{});
    defer tree.deinit(a);
    const value = try @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, 3);
    try std.testing.expectEqualDeep([4]?i64{ null, null, null, null }, value.values);
    try std.testing.expect(value.lock == null and value.size_protect == null);
}
test "OLE margin domain reuses strict malformed overflow duplicate and namespace checks" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<p:ole><p:outMargin left='4294967296'/></p:ole>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:ole><p:outMargin left='-2147483649'/></p:ole>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:ole><p:outMargin left=''/></p:ole>", error.InvalidSignedOrUnsigned32 },
        .{ "<p:ole><p:outMargin/><p:outMargin/></p:ole>", error.DuplicatePictureOutsideMargin },
        .{ "<p:ole lock='maybe'/>", error.InvalidXmlBoolean },
        .{ "<p:ole><p:sz protect='maybe'/></p:ole>", error.InvalidXmlBoolean },
        .{ "<p:ole><p:sz/><p:sz/></p:ole>", error.DuplicatePictureGeometryChild },
        .{ "<x:ole xmlns:x='urn:foreign'/>", error.InvalidOleDisplayNode },
    }) |case| {
        const source = prefix ++ case[0] ++ suffix;
        var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, 3));
        try std.testing.expectEqualStrings(source, tree.source);
    }
}

test "OLE margin lexical diagnostic separates schema nonnegative width from reader uint32 limits" {
    inline for (.{
        .{ "0", probe.LexicalDomain.model_unsigned32 },
        .{ "-0", probe.LexicalDomain.model_unsigned32 },
        .{ " +000 ", probe.LexicalDomain.model_unsigned32 },
        .{ "4294967295", probe.LexicalDomain.model_unsigned32 },
        .{ "4294967296", probe.LexicalDomain.nonnegative_exceeds_reader_u32 },
        .{ "99999999999999999999999999999999999", probe.LexicalDomain.nonnegative_exceeds_reader_u32 },
        .{ "-1", probe.LexicalDomain.observed_signed32 },
        .{ "-2147483648", probe.LexicalDomain.observed_signed32 },
        .{ "-2147483649", probe.LexicalDomain.reader_rejected },
        .{ "", probe.LexicalDomain.reader_rejected },
        .{ "1.5", probe.LexicalDomain.reader_rejected },
        .{ "++1", probe.LexicalDomain.reader_rejected },
    }) |case| try std.testing.expectEqual(case[1], try probe.classifyLexical(case[0]));
    const too_long: [4097]u8 = @splat('0');
    try std.testing.expectError(error.LimitExceeded, probe.classifyLexical(&too_long));
}

fn isolatedMarginCase(a: std.mem.Allocator) !void {
    const source = prefix ++ "<p:ole textWrap='FUTURE_WRAP' textFlow='FUTURE_FLOW' zOrder='bad' lock='&#49;'><p:sz protect='&#48;'/><p:outMargin left='&#48;' right='+4294967295' top='-2147483648'/></p:ole>" ++ suffix;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const actual = try @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, 3);
    try std.testing.expectEqualDeep([4]?i64{ 0, 4294967295, -2147483648, null }, actual.values);
    try std.testing.expectEqualDeep([4]probe.Domain{ .official_model_unsigned32, .official_model_unsigned32, .observed_signed32, .absent }, actual.domains);
    try std.testing.expectEqual(@as(?bool, true), actual.lock);
    try std.testing.expectEqual(@as(?bool, false), actual.size_protect);
    const flow_error = if (@import("picture_flow_values.zig").readOle(a, &tree, 3)) |_| return error.TestExpectedError else |err| err;
    if (flow_error == error.OutOfMemory) return error.OutOfMemory;
    try std.testing.expect(flow_error == error.UnsupportedPictureGeometryEnum);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "OLE margin domain query isolates unrelated flow enums and cleans allocation failures" {
    try isolatedMarginCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(isolatedMarginCase, .{});
}
test "OLE margin query preserves direct owner bounds and full flow error precedence" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:ole textWrap='FUTURE_WRAP'><p:outMargin left='4294967296'/></p:ole>" ++ suffix;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, 3));
    try std.testing.expectError(error.UnsupportedPictureGeometryEnum, @import("picture_flow_values.zig").readOle(a, &tree, 3));
    for ([_]usize{ 0, 1, 2, tree.elements.len }) |node| try std.testing.expectError(error.InvalidOleDisplayNode, @import("ole_source_values.zig").readOutsideMarginDomain(a, &tree, node));
    try std.testing.expectError(error.InvalidPictureDisplayNode, @import("picture_flow_values.zig").readOutsideMargins(a, &tree, tree.elements.len));
    try std.testing.expectEqualStrings(source, tree.source);
}
