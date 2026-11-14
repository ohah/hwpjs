const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");

test "HWPX inline object admission rejects v1 and unmanaged v2 without changing saved state" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        var h = if (v2) try histories.History.initV2(&session, .{}) else try histories.History.init(&session, 8, 8 * 1024 * 1024);
        defer h.deinit();
        const before = try session.save();
        defer a.free(before);
        const pointer = session.source.ptr;
        const serial = session.mutation_serial;
        const revision = h.revision();
        // Missing request payloads must never be parsed on an unauthorized history.
        for ([_]histories.Command{
            .{ .kind = .equation_insert, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" },
            .{ .kind = .chart_create, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" },
        }) |command| {
            try std.testing.expectError(error.HistoryProtocol2Required, h.apply(&session, command));
            try std.testing.expectEqual(pointer, session.source.ptr);
            try std.testing.expectEqual(serial, session.mutation_serial);
            try std.testing.expectEqual(revision, h.revision());
            const after = try session.save();
            defer a.free(after);
            try std.testing.expectEqualSlices(u8, before, after);
        }
    }
}

test "HWPX inline object admission rejects mixed batch before missing payload and preserves redo" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var h = try histories.History.initV2(&session, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "A" }));
    try std.testing.expect(try h.undo(&session));
    const serial = session.mutation_serial;
    const revision = h.revision();
    const pointer = session.source.ptr;
    for ([_]histories.Command{
        .{ .kind = .equation_insert, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" },
        .{ .kind = .chart_create, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" },
    }) |command| {
        try std.testing.expectError(error.InvalidInsertDocumentBatch, h.applyBatch(&session, &.{ command, command }));
        try std.testing.expectEqual(pointer, session.source.ptr);
        try std.testing.expectEqual(serial, session.mutation_serial);
        try std.testing.expectEqual(revision, h.revision());
    }
    try std.testing.expect(try h.redo(&session));
    const text = try session.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("A", text);
}
