const std = @import("std");

fn fieldAxis(a: std.mem.Allocator) !void {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr/><p:ctrl><p:colPr/></p:ctrl><p:t><p:titleMark ignore='1'/></p:t><p:ctrl><p:fieldBegin id='8' type='BOOKMARK'/></p:ctrl><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const policy = @import("plain_paragraph_policy.zig");
    try policy.validateForFieldText(&tree, &sites, locations, 1);
    try std.testing.expectError(error.UnsupportedParagraphControl, policy.validateWithAnchors(&tree, &sites, locations, 1));
    try std.testing.expectError(error.UnsupportedParagraphControl, policy.validateForCharacterFormat(&tree, &sites, locations, 1));
    const axis = @import("title_mark_axis.zig");
    if (axis.build(a, &tree, &sites, locations, 1)) |unexpected| {
        var owned = unexpected;
        owned.deinit(a);
        return error.TestExpectedError;
    } else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(error.UnsupportedParagraphControl, err);
    }
    var projected = try axis.buildForFieldText(a, &tree, &sites, locations, 1);
    defer projected.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), projected.marks.len);
    try std.testing.expectEqual(@as(usize, 3), projected.display_units);
    try std.testing.expectEqual(@as(usize, 43), projected.source_units);
    try std.testing.expectEqual(@as(usize, 32), try projected.toSource(0, .after));
    try std.testing.expectEqual(@as(usize, 0), try projected.toDisplay(32));
    try std.testing.expectError(error.ProtectedInlineControl, projected.toDisplay(33 + 3));
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    try std.testing.expectEqual(@as(usize, 3), positions[positions.len - 1].end_unit);
}

test "HWPX title field axis preserves strict modes and every allocation failure" {
    try fieldAxis(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(fieldAxis, .{});
}

test "HWPX title field actual schedule retains source markers after save" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/추진일정.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expectEqual(@as(u32, 0), labels[0].start);
    const begin = session.sections[0].tree.sourceOf(labels[0].begin_element);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, labels[0].begin_element, 0, 0, "앞😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const after = try reopened.fieldLabels(0, 1);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, 1), after.len);
    try std.testing.expectEqualSlices(u8, begin, reopened.sections[0].tree.sourceOf(after[0].begin_element));
    try std.testing.expectEqual(labels[0].end + 5, after[0].end);
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
}
