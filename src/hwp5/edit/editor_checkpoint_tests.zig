const std = @import("std");
const edit = @import("style_preservation.zig");
const a = std.testing.allocator;

fn fixture(name: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
    defer a.free(path);
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
}

test "HWP5 checkpoint restores real text empty nested field formula and format states" {
    const Case = struct { name: []const u8, command: edit.Command };
    const cases = [_]Case{
        .{ .name = "charshape", .command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "복원😀" } } },
        .{ .name = "table", .command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "빈셀😀" } } },
        .{ .name = "software", .command = .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "중첩😀" } } },
        .{ .name = "issue144-fields-crossing-lineseg-boundary", .command = .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .utf8 = "필드😀" } } },
        .{ .name = "chart", .command = .{ .splice_text = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "2" } } },
        .{ .name = "charshape", .command = .{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .char_shape_id = 0 } } },
    };
    for (cases) |case| {
        const input = try fixture(case.name);
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        const before = try session.createCheckpoint(8_000_000);
        defer before.deinit();
        try std.testing.expect(try session.matchesCheckpoint(before));
        try session.apply(case.command);
        try std.testing.expect(!try session.matchesCheckpoint(before));
        const edited = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(edited.bytes);
        try std.testing.expect(!std.mem.eql(u8, input, edited.bytes));
        try session.restoreCheckpoint(before);
        const restored = try session.save(a, .{});
        defer a.free(restored.bytes);
        try std.testing.expect(!restored.layout_requires_reflow);
        try std.testing.expectEqualSlices(u8, input, restored.bytes);
        try session.restoreCheckpoint(before);
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, edited.bytes, redone.bytes);
    }
}

test "HWP5 checkpoint rejects foreign sessions and size growth before exchanging values" {
    const input = try fixture("charshape");
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const other = try edit.Session.open(a, input);
    defer other.close();
    try std.testing.expectError(error.LimitExceeded, session.createCheckpoint(0));
    try std.testing.expectError(error.LimitExceeded, session.checkpointSize(0));
    const before = try session.createCheckpoint(try session.checkpointSize(std.math.maxInt(usize)));
    defer before.deinit();
    const info = try session.paragraph(0, 1);
    try session.apply(.{ .set_style = .{ .section = 0, .paragraph = 1, .style_id = info.style_id } });
    try std.testing.expect(try session.matchesCheckpoint(before));
    try std.testing.expectError(error.SourceBindingMismatch, other.matchesCheckpoint(before));
    try std.testing.expectError(error.SourceBindingMismatch, other.restoreCheckpoint(before));
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "증가😀" } });
    const edited = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    try std.testing.expectError(error.LimitExceeded, session.restoreCheckpoint(before));
    const preserved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(preserved.bytes);
    try std.testing.expectEqualSlices(u8, edited.bytes, preserved.bytes);
    const unchanged = try other.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
}

test "HWP5 checkpoint all capture allocation failures preserve current session" {
    const input = try fixture("charshape");
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const session = try edit.Session.open(allocator, bytes);
            defer session.close();
            const checkpoint = session.createCheckpoint(8_000_000) catch |err| {
                const saved = try session.save(a, .{});
                defer a.free(saved.bytes);
                try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
                return err;
            };
            defer checkpoint.deinit();
            try session.restoreCheckpoint(checkpoint);
            const saved = try session.save(a, .{});
            defer a.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
        }
    }.run, .{input});
}

test "HWP5 checkpoint exchanges without allocating when the session allocator refuses growth" {
    const input = try fixture("charshape");
    defer a.free(input);
    var failing = std.testing.FailingAllocator.init(a, .{});
    const allocator = failing.allocator();
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    const before = try session.createCheckpoint(8_000_000);
    defer before.deinit();
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "무할당😀" } });
    const edited = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    const index = failing.alloc_index;
    failing.fail_index = index;
    failing.resize_fail_index = failing.resize_index;
    try session.restoreCheckpoint(before);
    try std.testing.expectEqual(index, failing.alloc_index);
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
    try session.restoreCheckpoint(before);
    try std.testing.expectEqual(index, failing.alloc_index);
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, edited.bytes, redone.bytes);
}
