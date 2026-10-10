const std = @import("std");

test "HWP5 mixed resize split batch late refusal rolls back typed matrices structure and redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const pictures = try session.pictureSources(a, 0, .base73);
    defer a.free(pictures);
    const resize: edit.Command = .{ .resize_picture = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 } };
    try std.testing.expect(try history.apply(session, resize));
    const prior = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(prior.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidSection, history.applyBatch(session, &.{
        resize,
        .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } },
        .{ .resize_picture = .{ .section = 999, .picture_node = 0, .width = 1, .height = 1 } },
    }));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, prior.bytes, redone.bytes);
}

test "HWP5 resize and paragraph split ordering preserves moved picture matrices" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    for ([_]bool{ false, true }) |resize_first| {
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        const pictures = try session.pictureSources(a, 0, .base73);
        defer a.free(pictures);
        const resize: edit.Command = .{ .resize_picture = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 } };
        const split: edit.Command = .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } };
        try std.testing.expect(try history.apply(session, if (resize_first) resize else split));
        try std.testing.expect(try history.apply(session, if (resize_first) split else resize));
        const live = try session.drawingLocalTransforms(a, 0);
        defer a.free(live);
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        const moved = try reopened.pictureSources(a, 0, .base73);
        defer a.free(moved);
        try std.testing.expect(moved[0].picture_node != pictures[0].picture_node);
        const transforms = try reopened.drawingLocalTransforms(a, 0);
        defer a.free(transforms);
        try std.testing.expectEqual(live.len, transforms.len);
        for (live, transforms) |before, after| try std.testing.expectEqualDeep(before.matrix, after.matrix);
        try std.testing.expectEqualDeep(pictures[0].points, moved[0].points);
        try std.testing.expect(try history.undo(session));
        try std.testing.expect(try history.undo(session));
        const original = try session.save(a, .{});
        defer a.free(original.bytes);
        try std.testing.expectEqualSlices(u8, input, original.bytes);
    }
}

test "HWP5 picture resize session fourteen live matrices reopen history and refusal preserve redo" {
    const a = std.testing.allocator;
    const edit = @import("style_preservation.zig");
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        const pictures = try session.pictureSources(a, 0, .base73);
        defer a.free(pictures);
        for (pictures) |picture| {
            const command: edit.Command = .{ .resize_picture = .{ .section = 0, .picture_node = @intCast(picture.picture_node), .width = 10000, .height = 6000 } };
            try std.testing.expect(try history.apply(session, command));
            try std.testing.expect(!try history.apply(session, command));
            const live = try session.drawingMatrixSources(a, 0);
            defer a.free(live);
            const transforms = try session.drawingLocalTransforms(a, 0);
            defer a.free(transforms);
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            const reopened = try edit.Session.open(a, saved.bytes);
            defer reopened.close();
            const matrices = try reopened.drawingMatrixSources(a, 0);
            defer a.free(matrices);
            const reopened_transforms = try reopened.drawingLocalTransforms(a, 0);
            defer a.free(reopened_transforms);
            try std.testing.expectEqualDeep(live, matrices);
            try std.testing.expectEqualDeep(transforms, reopened_transforms);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{});
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, input, restored.bytes);
            try std.testing.expectError(error.InvalidSection, history.apply(session, .{ .resize_picture = .{ .section = 999, .picture_node = 0, .width = 1, .height = 1 } }));
            try std.testing.expect(try history.redo(session));
            const repeated = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(repeated.bytes);
            try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
            try std.testing.expect(try history.undo(session));
        }
    }
}
