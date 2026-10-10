const std = @import("std");
const Session = @import("../edit/style_preservation.zig").Session;

test "distribution native editor explicit open input save reopen and history retain flags" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "viewtext", "distribution" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
        defer a.free(input);
        try std.testing.expectError(error.UnsupportedDistribution, Session.open(a, input));
        const session = try Session.openDistribution(a, input);
        defer session.close();
        const shapes = try session.characterShapes(a);
        defer a.free(shapes);
        const paragraphs = try session.paragraphShapes(a);
        defer a.free(paragraphs);
        const fonts = try session.fontFaces(a);
        defer {
            for (fonts) |*font| font.deinit(a);
            a.free(fonts);
        }
        try std.testing.expectEqual(session.characterShapeCount(), shapes.len);
        try std.testing.expectEqual(session.paragraphShapeCount(), paragraphs.len);
        const unchanged = try session.save(a, .{});
        defer a.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
        var history = try @import("../edit/editor_history.zig").History.init(a, session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "배포편집😀<&" } }));
        try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try std.testing.expect(saved.layout_requires_reflow);
        const reopened = try Session.openDistribution(a, saved.bytes);
        defer reopened.close();
        const expected = try session.copyText(a, 0, 0);
        defer a.free(expected);
        const actual = try reopened.copyText(a, 0, 0);
        defer a.free(actual);
        try std.testing.expectEqualSlices(u8, expected, actual);
        var source = try @import("../text_source.zig").Source.openReadOnly(a, saved.bytes);
        defer source.deinit();
        try std.testing.expect(source.header.has(.distribution));
        try std.testing.expect(try history.undo(session));
        const undone = try session.save(a, .{});
        defer a.free(undone.bytes);
        try std.testing.expectEqualSlices(u8, input, undone.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}

test "distribution native editor open allocation failures preserve source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4000000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const session = try Session.openDistribution(allocator, bytes);
            defer session.close();
            try std.testing.expectEqual(@as(usize, 1), session.sectionCount());
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{@as([]const u8, input)});
    try std.testing.expectEqualSlices(u8, before, input);
    const normal = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4000000));
    defer a.free(normal);
    try std.testing.expectError(error.NotDistributionDocument, Session.openDistribution(a, normal));
}

test "distribution native editor save allocation failures preserve model and source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4000000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const session = try Session.openDistribution(a, input);
    defer session.close();
    var history = try @import("../edit/editor_history.zig").History.init(a, session, 8, 4000000);
    defer history.deinit();
    _ = try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "저장검증😀" } });
    const expected_text = try session.copyText(a, 0, 0);
    defer a.free(expected_text);
    const expected_save = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(expected_save.bytes);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, edited: *Session, expected: []const u8) !void {
            const saved = try edited.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, expected, saved.bytes);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ session, @as([]const u8, expected_save.bytes) });
    const actual_text = try session.copyText(a, 0, 0);
    defer a.free(actual_text);
    try std.testing.expectEqualSlices(u8, expected_text, actual_text);
    try std.testing.expectEqualSlices(u8, before, input);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
}
