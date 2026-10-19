const std = @import("std");
const values = @import("ole_source_values.zig");
const parse = @import("section_tree.zig").parse;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'>";

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try parse(a, prefix ++ "<p:ole binaryItemIDRef='ole&#51;' objectType='UNKNOWN' drawAspect='CONTENT' hasMoniker='false' textWrap='TOP_AND_BOTTOM' textFlow='RIGHT_ONLY'><p:curSz width='0' height='0'/><p:sz width='22677' height='22677' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:pos treatAsChar='0' flowWithText='1' allowOverlap='0' vertRelTo='PARA' horzRelTo='COLUMN' vertAlign='TOP' horzAlign='CENTER' vertOffset='0' horzOffset='0'/><p:outMargin left='566' right='566' top='1417' bottom='2267'/></p:ole></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var result = try values.read(a, &tree, 1);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(?u32, 22677), result.geometry.width);
    try std.testing.expectEqualStrings("ole3", result.binary_item_id.?);
    try std.testing.expectEqualStrings("UNKNOWN", result.object_type.?);
    try std.testing.expectEqualStrings("CONTENT", result.draw_aspect.?);
    try std.testing.expectEqual(@as(?bool, false), result.has_moniker);
    try std.testing.expectEqualDeep([4]?bool{ null, true, false, null }, result.position.flags);
    try std.testing.expectEqual(@as(?u32, 1), result.flow.text_wrap);
    try std.testing.expectEqual(@as(?u32, 2), result.flow.text_flow);
    try std.testing.expectEqualDeep([4]?i64{ 566, 566, 1417, 2267 }, result.flow.outside_margins);
}

test "HWPX OLE source values share geometry and preserve owned strings under allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX OLE source values distinguish absent empty foreign and duplicate fields" {
    const a = std.testing.allocator;
    var tree = try parse(a, prefix ++ "<p:ole binaryItemIDRef=''><x:sz width='9'/></p:ole><x:ole/><p:pic/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var result = try values.read(a, &tree, 1);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(?u32, null), result.geometry.width);
    try std.testing.expect(result.object_type == null);
    try std.testing.expectEqual(@as(usize, 0), result.binary_item_id.?.len);
    for ([_]usize{ 0, 2, 3, 4, 999 }) |node| try std.testing.expectError(error.InvalidOleDisplayNode, values.read(a, &tree, node));
    var duplicate = try parse(a, prefix ++ "<p:ole><p:sz/><p:sz/></p:ole></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicatePictureGeometryChild, values.read(a, &duplicate, 1));
    var invalid = try parse(a, prefix ++ "<p:ole binaryItemIDRef='owned' hasMoniker='maybe'/></s:sec>", 0, 0, .{});
    defer invalid.deinit(a);
    try std.testing.expectError(error.InvalidXmlBoolean, values.read(a, &invalid, 1));
}

test "HWPX OLE source actual numeric document retains metadata and current protected position" {
    const a = std.testing.allocator;
    const bytes = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx", a, .limited(4_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const sites = @import("ole_display_sites.zig");
    const before = try sites.read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 1), before.len);
    try std.testing.expectEqual(@as(?usize, 11), before[0].paragraph);
    try std.testing.expectEqual(@as(?usize, 1), before[0].anchor_unit);
    try std.testing.expect(before[0].error_name == null);
    var source = try values.read(a, &session.sections[0].tree, before[0].ole_node);
    defer source.deinit(a);
    try std.testing.expectEqualStrings("ole3", source.binary_item_id.?);
    try std.testing.expectEqual(@as(?u32, 22677), source.geometry.width);
    try std.testing.expectEqualDeep([4]?i64{ 566, 566, 1417, 2267 }, source.flow.outside_margins);
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.expectEqualSlices(u8, bytes, baseline);
    _ = try session.spliceAnchored(0, 11, 0, 0, "앞😀");
    const after = try sites.read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(before[0].ole_node, after[0].ole_node);
    try std.testing.expectEqual(@as(?usize, 4), after[0].anchor_unit);
    try std.testing.expectEqual(@as(?usize, 1), before[0].anchor_unit);
    try std.testing.expectError(error.InvalidSectionIndex, sites.read(a, &session, session.sections.len));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const reopened_sites = try sites.read(a, &reopened, 0);
    defer a.free(reopened_sites);
    try std.testing.expectEqual(@as(usize, 1), reopened_sites.len);
    try std.testing.expectEqual(@as(?usize, 4), reopened_sites[0].anchor_unit);
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx", a, .limited(4_000_000));
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
}

test "HWPX OLE source detached strings outlive the source tree" {
    const a = std.testing.allocator;
    var result = block: {
        var tree = try parse(a, prefix ++ "<p:ole binaryItemIDRef='ole3' objectType='FUTURE' drawAspect='CONTENT'/></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        break :block try values.read(a, &tree, 1);
    };
    defer result.deinit(a);
    try std.testing.expectEqualStrings("ole3", result.binary_item_id.?);
    try std.testing.expectEqualStrings("FUTURE", result.object_type.?);
    try std.testing.expect(result.has_moniker == null);
}
