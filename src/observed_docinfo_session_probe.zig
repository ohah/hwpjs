test "observed DocInfo session real text input preserves all raw DocInfo and reopens with diagnostics" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var repaired = try @import("cfb/observed_repairs.zig").open(a, input, @import("hwp5/text_source.zig").cfb_limits);
    defer repaired.deinit();
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    try std.testing.expectError(error.UnexpectedEnd, Session.open(a, repaired.file.bytes));
    const session = try Session.openRetainingObservedDocInfo(a, repaired.file.bytes);
    defer session.close();
    const diagnostics = session.observedDocInfoDiagnostics().?;
    try std.testing.expectEqual(@as(usize, 50), diagnostics.unresolved_style_characters);
    try std.testing.expect(diagnostics.resource_count_mismatch);
    var target: ?usize = null;
    for (0..try session.paragraphCount(0)) |index| {
        const length = session.editableTextLength(a, 0, index) catch continue;
        if (length == 0) continue;
        target = index;
        break;
    }
    const paragraph = target orelse return error.MissingEditableParagraph;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "검증😀" } });
    const edited = try session.copyText(a, 0, paragraph);
    defer a.free(edited);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.openRetainingObservedDocInfo(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqualDeep(diagnostics, reopened.observedDocInfoDiagnostics().?);
    const again = try reopened.copyText(a, 0, paragraph);
    defer a.free(again);
    try std.testing.expectEqualSlices(u8, edited, again);
    const Source = @import("hwp5/text_source.zig").Source;
    var before = try Source.openReadOnly(a, repaired.file.bytes);
    defer before.deinit();
    var after = try Source.openReadOnly(a, saved.bytes);
    defer after.deinit();
    const original_info = try before.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(original_info);
    const saved_info = try after.decodeDocInfo(a, 32 * 1024 * 1024);
    defer a.free(saved_info);
    try std.testing.expectEqualSlices(u8, original_info, saved_info);
}

test "observed DocInfo session actual roundtrip releases every injected allocation failure" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/20250130-hongbo_saved.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var repaired = try @import("cfb/observed_repairs.zig").open(a, input, @import("hwp5/text_source.zig").cfb_limits);
    defer repaired.deinit();
    const original = try a.dupe(u8, repaired.file.bytes);
    defer a.free(original);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const Session = @import("hwp5/edit/style_preservation.zig").Session;
            const session = try Session.openRetainingObservedDocInfo(allocator, bytes);
            defer session.close();
            const diagnostics = session.observedDocInfoDiagnostics().?;
            const before = try session.copyText(allocator, 0, 2);
            defer allocator.free(before);
            try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "검증😀" } });
            const edited = try session.copyText(allocator, 0, 2);
            defer allocator.free(edited);
            try std.testing.expectEqual(before.len + 8, edited.len);
            try std.testing.expectEqualSlices(u8, before, edited[8..]);
            const saved = try session.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
            const reopened = try Session.openRetainingObservedDocInfo(allocator, saved.bytes);
            defer reopened.close();
            try std.testing.expectEqualDeep(diagnostics, reopened.observedDocInfoDiagnostics().?);
            const again = try reopened.copyText(allocator, 0, 2);
            defer allocator.free(again);
            try std.testing.expectEqualSlices(u8, edited, again);
        }
    }.run, .{repaired.file.bytes});
    try std.testing.expectEqualSlices(u8, original, repaired.file.bytes);
}
