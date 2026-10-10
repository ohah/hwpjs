//! Allocation-failure proof for multi-resource character property transactions.
const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX character property transaction allocation failure shard on mixed runs" {
    const raw_start = std.process.Environ.getPosix(std.testing.environ, "HWPJS_CHARACTER_FAILURE_START");
    const raw_end = std.process.Environ.getPosix(std.testing.environ, "HWPJS_CHARACTER_FAILURE_END");
    if (raw_start == null and raw_end == null) return error.SkipZigTest;
    const start = try std.fmt.parseInt(usize, raw_start orelse return error.MissingFailureShardStart, 10);
    const end = try std.fmt.parseInt(usize, raw_end orelse return error.MissingFailureShardEnd, 10);
    if (start >= end) return error.InvalidFailureShardRange;
    if (end - start != 1) return error.FailureShardRequiresIsolatedPoint;
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    for (start..end) |index| {
        if (try verifyFailure(input, index, .{ .bold = true })) {
            std.debug.print("HWPX failure shard {d}..{d}: failures {d}, success at {d}\n", .{ start, end, index - start, index });
            return;
        }
    }
    std.debug.print("HWPX failure shard {d}..{d}: failures {d}, no success endpoint in this shard\n", .{ start, end, end - start });
}

test "HWPX character property allocation measurement on mixed runs" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var failing = std.testing.FailingAllocator.init(a, .{});
    var session = try editor.open(failing.allocator(), input, .{});
    defer session.deinit();
    _ = try session.setCharacterProperties(0, 2, 0, 1, .{ .size = 1200, .bold = false });
    _ = try session.setCharacterProperties(0, 2, 1, 2, .{ .size = 2400, .bold = false });
    const initial = failing.alloc_index;
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 2, .{ .bold = true }));
    std.debug.print("HWPX mixed property command allocations: {d}\n", .{failing.alloc_index - initial});
}

test "HWPX font transaction preserves mixed resource state at sampled allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    for ([_]usize{ 0, 1, 10, 100, 1000, 5000, 20000, 50000 }) |index| {
        const succeeded = try verifyFailure(input, index, .{ .font_ids = .{ 0, null, null, null, null, null, null } });
        std.debug.print("HWPX font allocation sample {d}: {s}\n", .{ index, if (succeeded) "success" else "rollback" });
        try std.testing.expect(!succeeded);
    }
}

fn verifyFailure(input: []const u8, index: usize, patch: @import("../model/document.zig").CharacterPropertyPatch) !bool {
    // Release every debug bucket at each failure point without disabling leaks.
    var debug: std.heap.DebugAllocator(.{ .stack_trace_frames = 4 }) = .init;
    defer std.debug.assert(debug.deinit() == .ok);
    const a = debug.allocator();
    var failing = std.testing.FailingAllocator.init(a, .{});
    var session = try editor.open(failing.allocator(), input, .{});
    defer session.deinit();
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 1, .{ .size = 1200, .bold = false }));
    try std.testing.expect(try session.setCharacterProperties(0, 2, 1, 2, .{ .size = 2400, .bold = false }));
    const baseline = try session.save();
    defer failing.allocator().free(baseline);
    const baseline_spans = try @import("character_style_snapshot.zig").read(&session, 0, 2);
    defer failing.allocator().free(baseline_spans);
    const baseline_entries = try a.dupe(@import("character_resource_values.zig").Entry, session.character_resources.entries.items);
    defer a.free(baseline_entries);
    failing.fail_index = failing.alloc_index + index;
    const result = session.setCharacterProperties(0, 2, 0, 2, patch);
    failing.fail_index = std.math.maxInt(usize);
    if (result) |changed| {
        try std.testing.expect(changed);
        try std.testing.expectEqual(baseline_entries.len + 2, session.character_resources.entries.items.len);
        return true;
    } else |err| {
        try std.testing.expectEqual(error.OutOfMemory, err);
        try std.testing.expectEqualDeep(baseline_entries, session.character_resources.entries.items);
        const spans = try @import("character_style_snapshot.zig").read(&session, 0, 2);
        defer failing.allocator().free(spans);
        try std.testing.expectEqualDeep(baseline_spans, spans);
        const saved = try session.save();
        defer failing.allocator().free(saved);
        try std.testing.expectEqualSlices(u8, baseline, saved);
    }
    return false;
}
