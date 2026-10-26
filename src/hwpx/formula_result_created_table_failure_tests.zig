const std = @import("std");
const editor = @import("editor_session.zig");

fn attempt(a: std.mem.Allocator, base: *const editor.Session, begin: usize, expected: []const u8) !void {
    // Borrow immutable authority; only the override container is privately owned.
    const sections = try a.dupe(editor.Section, base.sections);
    defer a.free(sections);
    sections[0].formula_result_overrides = try base.sections[0].formula_result_overrides.clone(a);
    defer sections[0].formula_result_overrides.deinit(a);
    var candidate = base.*;
    candidate.allocator = a;
    candidate.sections = sections;
    _ = candidate.setManualFormulaResult(0, begin, "바꿈😀<&") catch |err| {
        try std.testing.expectEqualStrings("기존😀", sections[0].formula_result_overrides.get(begin).?);
        // Observe through a non-failing allocator, not a second injected failure.
        try @import("../testing/checked_allocator.zig").run(struct {
            fn run(observer_allocator: std.mem.Allocator, observed: *const editor.Session, expected_bytes: []const u8) !void {
                var observer = observed.*;
                observer.allocator = observer_allocator;
                const saved = try observer.save();
                defer observer_allocator.free(saved);
                try std.testing.expectEqualSlices(u8, expected_bytes, saved);
            }
        }.run, .{ &candidate, expected });
        try std.testing.expectEqualSlices(u8, base.source, candidate.source);
        return err;
    };
    try std.testing.expectEqualStrings("바꿈😀<&", sections[0].formula_result_overrides.get(begin).?);
    try std.testing.expectEqualStrings("기존😀", base.sections[0].formula_result_overrides.get(begin).?);
}

test "pending created table manual result transaction every allocation failure preserves saved authority" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 1, 0, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    try std.testing.expect(try @import("created_table_session.zig").stage(&session, 0, 1, 0, &table));
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 24, 0, 0)).?;
    try std.testing.expect(try session.setManualFormulaResult(0, target.begin_element, "기존😀"));
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(attempt, .{ &session, target.begin_element, before });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
