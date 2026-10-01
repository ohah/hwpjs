const std = @import("std");
const core = @import("hwpjs");
const edit = core.hwp5.experimental_style_preservation;
const a = std.testing.allocator;
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp";

test "text splice nested table ownership allocation failures stay atomic" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    const Run = struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, format: bool) !void {
            const session = try edit.Session.open(allocator, source);
            defer session.close();
            const before = try session.copyText(a, 0, 2);
            defer a.free(before);
            const command: edit.Command = if (format)
                .{ .set_character_format = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 1, .char_shape_id = 0 } }
            else
                .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "한😀" } };
            session.apply(command) catch |err| {
                const after = try session.copyText(a, 0, 2);
                defer a.free(after);
                try std.testing.expectEqualSlices(u8, before, after);
                const saved = try session.save(a, .{});
                defer a.free(saved.bytes);
                try std.testing.expectEqualSlices(u8, source, saved.bytes);
                return err;
            };
            const saved = try session.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Run.run, .{ bytes, false });
    try std.testing.checkAllAllocationFailures(a, Run.run, .{ bytes, true });
}

test "text splice character format mixed commands and atomic refusals" {
    const bytes = try input();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const original = try session.copyText(a, 0, 1);
    defer a.free(original);
    try session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .char_shape_id = 0 } });
    const noop = try session.save(a, .{});
    defer a.free(noop.bytes);
    try std.testing.expectEqualSlices(u8, bytes, noop.bytes);
    try session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 1, .end_unit = 5, .char_shape_id = 0 } });
    const unchanged_text = try session.copyText(a, 0, 1);
    defer a.free(unchanged_text);
    try std.testing.expectEqualSlices(u8, original, unchanged_text);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 2, .end_unit = 2, .utf8 = "😀" } });
    try session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 2, .end_unit = 4, .char_shape_id = 1 } });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    try std.testing.expectError(error.SplitSurrogatePair, session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 3, .end_unit = 4, .char_shape_id = 0 } }));
    try std.testing.expectError(error.InvalidResourceReference, session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .char_shape_id = 0xffffffff } }));
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, after.bytes);
    var model = try core.hwp5.model_projection.fromFile(a, saved.bytes);
    defer model.deinit(a);
    var found = false;
    for (model.sections[0].paragraphs[1].character_runs) |r| {
        if (r.start_unit == 2 and r.char_shape_id == 1) found = true;
    }
    try std.testing.expect(found);
}

test "text splice character format allocation failures preserve complete model" {
    const bytes = try input();
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const session = try edit.Session.open(allocator, source);
            defer session.close();
            session.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 1, .end_unit = 5, .char_shape_id = 0 } }) catch |err| {
                const after = try session.save(a, .{});
                defer a.free(after.bytes);
                try std.testing.expectEqualSlices(u8, source, after.bytes);
                return err;
            };
            const saved = try session.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
        }
    }.run, .{bytes});
}

fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, fixture, a, .limited(2_000_000));
}

test "text splice real fixture repeated edits and layout refusal" {
    const bytes = try input();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const original = try session.copyText(a, 0, 1);
    defer a.free(original);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "한😀" } });
    const changed = try session.copyText(a, 0, 1);
    defer a.free(changed);
    try std.testing.expectEqual(original.len + 6, changed.len);
    try std.testing.expectEqualSlices(u8, original, changed[6..]);
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    try std.testing.expectError(error.SplitSurrogatePair, session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 2, .end_unit = 2, .utf8 = "x" } }));
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 3, .utf8 = "" } });
    const restored = try session.copyText(a, 0, 1);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, original, restored);
    const output = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(output.bytes);
    var reloaded = try core.hwp5.model_projection.fromFile(a, output.bytes);
    defer reloaded.deinit(a);
    try std.testing.expectEqual(original.len / 2, reloaded.sections[0].paragraphs[1].declared_units);
    try std.testing.expect(output.layout_requires_reflow);
}

test "text splice invalid commands are atomic and noop is exact" {
    const bytes = try input();
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const original = try session.copyText(a, 0, 1);
    defer a.free(original);
    for ([_]edit.TextSplice{
        .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "\n" },
        .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "\x00" },
        .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "\xff" },
        .{ .section = 0, .paragraph = 1, .start_unit = 1, .end_unit = 0, .utf8 = "x" },
        .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = @intCast(original.len / 2), .utf8 = "" },
    }) |command| {
        if (session.apply(.{ .splice_text = command })) |_| return error.ExpectedRefusal else |_| {}
        const after = try session.copyText(a, 0, 1);
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, original, after);
    }
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "" } });
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
}

test "text splice allocation failures preserve session and clean all buffers" {
    const bytes = try input();
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const session = try edit.Session.open(allocator, source);
            defer session.close();
            const before = try session.copyText(a, 0, 1);
            defer a.free(before);
            session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "한😀" } }) catch |err| {
                const after = try session.copyText(a, 0, 1);
                defer a.free(after);
                try std.testing.expectEqualSlices(u8, before, after);
                return err;
            };
            const saved = try session.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
        }
    }.run, .{bytes});
}

test "text splice mixed commands multiple paragraphs deterministic output and isolation" {
    const bytes = try input();
    defer a.free(bytes);
    const first = try edit.Session.open(a, bytes);
    defer first.close();
    const second = try edit.Session.open(a, bytes);
    defer second.close();
    const original = try second.copyText(a, 0, 1);
    defer a.free(original);
    try first.apply(.{ .set_style = .{ .section = 0, .paragraph = 1, .style_id = 1 } });
    try first.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 1, .end_unit = 2, .utf8 = "😀" } });
    try first.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 1, .utf8 = "" } });
    const other = try second.copyText(a, 0, 1);
    defer a.free(other);
    try std.testing.expectEqualSlices(u8, original, other);
    const saved = try first.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const repeated = try first.save(a, .{ .allow_stale_layout = true });
    defer a.free(repeated.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
    try std.testing.expectError(error.LimitExceeded, first.save(a, .{ .allow_stale_layout = true, .max_output_bytes = 1 }));
    var reloaded = try core.hwp5.model_projection.fromFile(a, saved.bytes);
    defer reloaded.deinit(a);
    try std.testing.expectEqual(@as(u8, 1), reloaded.sections[0].paragraphs[1].style_id);
    try std.testing.expectEqual(original.len / 2 + 1, reloaded.sections[0].paragraphs[1].declared_units);
}
