const std = @import("std");
const a = std.testing.allocator;
const Session = @import("hwp5/edit/style_preservation.zig").Session;
const History = @import("hwp5/edit/editor_history.zig").History;
const api = @import("hwp5/edit/source_table_cell_split_service.zig");
const base = @import("hwp5/edit/source_table_cell_split_tests.zig");
const merged = @import("hwp5/edit/source_table_cell_split_merged_tests.zig");
comptime {
    _ = base;
    _ = merged;
    _ = @import("hwp5/edit/source_table_cell_split_extent_tests.zig");
}

test "H5 rebase legacy public capture refuses merged while explicit Native capture shares current binding" {
    const input = try merged.fixture(.full);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const node = try base.tableNode(session);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, service.capture(a, 0, node, 0, 0));
    const before = try base.save(session);
    defer a.free(before);
    try std.testing.expectEqualSlices(u8, input, before);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const target = try service.captureWithSpans(a, 0, node, 0, 0);
    try std.testing.expectEqual(@as(u32, 2), target.row_span);
    try std.testing.expectEqual(@as(u32, 2), target.column_span);
    try std.testing.expect(try service.apply(a, target, 2, 2));
    try std.testing.expect(try history.undo(session));
    const undo = try base.save(session);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, input, undo);
    try std.testing.expectError(error.StaleMutationEpoch, service.apply(a, target, 2, 2));
}

test "H5 rebase legacy capture refuses unselected spans without changing source" {
    const input = try merged.fixture(.vertical);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const node = try base.tableNode(session);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, service.capture(a, 0, node, 0, 1));
    const target = try service.captureWithSpans(a, 0, node, 0, 1);
    try std.testing.expectEqual(@as(u32, 1), target.row_span);
    try std.testing.expectEqual(@as(u32, 1), target.column_span);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const saved = try base.save(session);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "H5 rebase public unmerged extent capture keeps same issuer and one history" {
    const original = try base.authoredInput();
    defer a.free(original);
    const input = try @import("hwp5/edit/source_table_cell_split_extent_tests.zig").declared(original, 7777, 4000);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const node = try base.tableNode(session);
    const target = try service.capture(a, 0, node, 0, 0);
    const explicit = try service.captureWithSpans(a, 0, node, 0, 0);
    try std.testing.expect(std.meta.eql(target, explicit));
    try std.testing.expect(try service.apply(a, target, 2, 3));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const output = try base.save(session);
    defer a.free(output);
    try std.testing.expect(try history.undo(session));
    const undo = try base.save(session);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, input, undo);
    try std.testing.expectError(error.StaleMutationEpoch, service.apply(a, target, 2, 3));
    try std.testing.expect(try history.redo(session));
    const redo = try base.save(session);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, output, redo);
}
