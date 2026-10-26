const std = @import("std");
const t = std.testing;
const Session = @import("editor_session.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' styleIDRef='7'><p:run charPrIDRef='6'><p:t>AB</p:t></p:run><p:run";
const suffix = "><p:t>CD</p:t></p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='4'><h:charPr id='0'/><h:charPr id='3'/><h:charPr id='5'/><h:charPr id='6'/></h:charProperties><h:styles itemCnt='1'><h:style id='7' charPrIDRef='5'/></h:styles></h:refList></h:head>";
fn run(a: std.mem.Allocator, input: []const u8, expected: ?u32) !void {
    var session = try Session.open(a, input, .{});
    defer session.deinit();
    try t.expect(try session.splitParagraph(0, 1, 4, 0));
    const right = &session.sections[0].structure_values.?.paragraphs[1];
    // A null owner is intentional raw absence, not a request to resolve style7.
    try t.expect(right.character_styles != null);
    try t.expectEqual(expected, right.character_styles.?[0].char_shape_id);
    try t.expect(try session.splice(0, 2, 0, 0, "x"));
    try t.expectEqual(expected, session.sections[0].structure_values.?.paragraphs[1].character_styles.?[0].char_shape_id);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try Session.open(a, saved, .{});
    defer reopened.deinit();
    const ranges = try @import("character_style_snapshot.zig").read(&reopened, 0, 2);
    defer a.free(ranges);
    var found = false;
    for (ranges) |range| if (range.start_unit == 0 and range.end_unit == 1) {
        try t.expectEqual(expected, range.char_shape_id);
        found = true;
    };
    try t.expect(found);
    const again = try reopened.save();
    defer a.free(again);
    try t.expectEqualSlices(u8, saved, again);
}
test "implicit tail continuation preserves absence distinctly from explicit zero and five" {
    const a = t.allocator;
    const cases = [_]struct { tail: []const u8, expected: ?u32 }{
        .{ .tail = "", .expected = null },
        .{ .tail = " charPrIDRef='0'", .expected = 0 },
        .{ .tail = " charPrIDRef='5'", .expected = 5 },
    };
    for (cases) |case| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, case.tail, suffix });
        defer a.free(xml);
        const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
        defer a.free(input);
        try run(a, input, case.expected);
    }
}
test "implicit tail continuation OOM retains original input and source owned style separation" {
    const a = t.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, prefix ++ suffix, header);
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    var counter = t.FailingAllocator.init(a, .{});
    var no_resize: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
    try run(no_resize.allocator(), input, null);
    if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
    try @import("../testing/allocation_failures.zig").check(run, .{ input, @as(?u32, null) });
    try t.expectEqualSlices(u8, original, input);
}

test "implicit tail selected raw tag absence keeps foreign attributes and rejects malformed reference" {
    const a = t.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:run charPrIDRef = '&#54;' x:charPrIDRef='9' opaque='keep&amp;x'/><p:run charPrIDRef='abc'/></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const tag = @import("character_style_tag.zig");
    const result = try tag.writeSelected(a, &tree, 1, null, 1000);
    defer a.free(result);
    try t.expectEqualStrings("<p:run  x:charPrIDRef='9' opaque='keep&amp;x'/>", result);
    try t.expectError(error.LimitExceeded, tag.writeSelected(a, &tree, 1, null, result.len - 1));
    try t.expectError(error.InvalidNonNegativeInteger, tag.writeSelected(a, &tree, 2, null, 1000));
    try t.expectError(error.InvalidRunElement, tag.writeSelected(a, &tree, 0, null, 1000));
    try t.expectEqualStrings(source, tree.source);
    const Probe = struct {
        fn check(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            const bytes = try @import("character_style_tag.zig").writeSelected(allocator, input, 1, null, 1000);
            defer allocator.free(bytes);
            try t.expectEqualStrings("<p:run  x:charPrIDRef='9' opaque='keep&amp;x'/>", bytes);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.check, .{&tree});
}
