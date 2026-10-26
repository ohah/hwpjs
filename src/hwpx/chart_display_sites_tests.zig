const std = @import("std");
test "chart display sites skip unrelated paragraph projection when there are no charts" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    // A negative control makes accidental unrelated display collection fail.
    session.sections[0].first_paragraph = 0;
    session.sections[0].source_first_paragraph = null;
    if (@import("display_current_paragraphs.zig").read(a, &session.sections[0], session.options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.ExpectedUnrelatedProjectionFailure;
    } else |err| try std.testing.expectEqual(error.SourceBindingMismatch, err);
    const sites = try @import("chart_display_sites.zig").read(a, &session, 0);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 0), sites.len);
}
test "chart display sites follow current prefix and split ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const initial = try @import("chart_display_sites.zig").read(a, &session, 0);
    defer a.free(initial);
    try std.testing.expectEqual(@as(usize, 1), initial.len);
    try std.testing.expectEqual(@as(?usize, 1), initial[0].paragraph);
    try std.testing.expectEqual(@as(?usize, 0), initial[0].anchorUnit);
    try std.testing.expect(initial[0].error_name == null);
    _ = try session.spliceAnchored(0, 1, 0, 0, "본문😀<&");
    _ = try session.splitParagraphAnchored(0, 1, 0, 0);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, opened: *const @import("editor_session.zig").Session, wrapper: usize) !void {
            const sites = try @import("chart_display_sites.zig").read(allocator, opened, 0);
            defer allocator.free(sites);
            try std.testing.expectEqual(@as(usize, 1), sites.len);
            try std.testing.expectEqual(wrapper, sites[0].wrapper);
            try std.testing.expectEqual(@as(?usize, 2), sites[0].paragraph);
            try std.testing.expectEqual(@as(?usize, 6), sites[0].anchorUnit);
            try std.testing.expect(sites[0].error_name == null);
        }
    }.run, .{ @as(*const @import("editor_session.zig").Session, &session), initial[0].wrapper });
}
