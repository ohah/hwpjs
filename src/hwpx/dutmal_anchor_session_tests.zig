const std = @import("std");

test "dutmal actual field input preserves main sub strings and opaque XML" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const trees = [_]@import("xml_part_tree.zig").Tree{session.sections[0].tree};
    var report = try @import("inline_string_controls.zig").inspect(a, &trees, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.controls.len);
    try std.testing.expectEqual(@as(usize, 2), report.texts.len);
    try std.testing.expectEqualStrings("팀단위 훈련", report.texts[0].value);
    try std.testing.expectEqualStrings("전술훈련 30% + 현지훈련 20%", report.texts[1].value);
    const labels = try session.fieldLabels(0, 26);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceFieldLabel(0, 26, labels[0].begin_element, 43, 1, ""));
    try std.testing.expect(try session.spliceFieldLabel(0, 26, labels[0].begin_element, 0, 0, "앞😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const after_trees = [_]@import("xml_part_tree.zig").Tree{reopened.sections[0].tree};
    var after = try @import("inline_string_controls.zig").inspect(a, &after_trees, .{});
    defer after.deinit();
    try std.testing.expectEqualStrings(report.controls[0].raw_xml, after.controls[0].raw_xml);
    try std.testing.expectEqualStrings(report.texts[0].value, after.texts[0].value);
    try std.testing.expectEqualStrings(report.texts[1].value, after.texts[1].value);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
