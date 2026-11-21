const std = @import("std");
const a = std.testing.allocator;
const fixture = @import("page_restart_history_fixture.zig");
const h5 = @import("hwp5/edit/style_preservation.zig");
const H5History = @import("hwp5/edit/editor_history.zig").History;
const hx = @import("hwpx/editor_session.zig");
const hx_history = @import("hwpx/editor_history.zig");
fn hxCommand(request: *const @import("hwpx/page_restart_history.zig").Request) hx_history.Command {
    return .{ .kind = .page_restart, .page_restart = request, .section = request.before.target.section, .paragraph = request.before.paragraph, .start = 0, .deleted = 0, .inserted = "" };
}
// Test evidence only. An explicit harness flag enables exclusive files in its private cwd.
// This never changes a product save policy, permission, expectation or return value.
fn emitApprovedArtifact(name: []const u8, bytes: []const u8) !void {
    const enabled = std.testing.environ.getAlloc(a, "HWPJS_PAGE_RESTART_ARTIFACTS") catch |err| switch (err) {
        error.EnvironmentVariableMissing => return,
        else => return err,
    };
    defer a.free(enabled);
    if (!std.mem.eql(u8, enabled, "1")) return error.InvalidPageRestartArtifactFlag;
    const file = try std.Io.Dir.cwd().createFile(std.testing.io, name, .{ .exclusive = true, .truncate = false });
    defer file.close(std.testing.io);
    try file.writeStreamingAll(std.testing.io, bytes);
}
test "H5 PAGE restart History2 default guards consent save raw undo redo and reopen" {
    const input = try fixture.h5(a, 2);
    defer a.free(input);
    const s = try h5.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try H5History.initV2(a, s, .{});
    defer h.deinit();
    const before = try s.save(a, .{});
    defer a.free(before.bytes);
    try std.testing.expectEqualSlices(u8, input, before.bytes);
    try std.testing.expect(!before.layout_requires_reflow);
    try std.testing.expectError(error.UnsupportedStrictBody, s.prepareStrictLayout(a));
    try emitApprovedArtifact("h5-page-restart-seed.hwp", before.bytes);
    const selected = try fixture.h5Control(a, s, 1);
    const read = try h.pageRestart(s, a, 1, selected);
    try std.testing.expectEqual(@as(u32, 3), read.anchor.current_unit);
    const request: @import("hwp5/edit/page_restart_history.zig").Request = .{ .before = read, .number = 30 };
    try std.testing.expect(try h.apply(s, .{ .edit_page_restart = request }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    // Default rejection is preserved; only this explicitly approved Native retry opts in.
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(saved.layout_requires_reflow);
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try emitApprovedArtifact("h5-page-restart-edited.hwp", saved.bytes);
    var original = try @import("hwp5/text_source.zig").Source.open(a, before.bytes);
    defer original.deinit();
    var result = try @import("hwp5/text_source.zig").Source.open(a, saved.bytes);
    defer result.deinit();
    const old_section = try original.decodeSection(a, 0);
    defer a.free(old_section);
    const new_section = try result.decodeSection(a, 0);
    defer a.free(new_section);
    try std.testing.expectEqualSlices(u8, old_section, new_section);
    const old_selected = try original.decodeSection(a, 1);
    defer a.free(old_selected);
    const new_selected = try result.decodeSection(a, 1);
    defer a.free(new_selected);
    try std.testing.expectEqual(old_selected.len, new_selected.len);
    var records = @import("hwp5/record.zig").Iterator.init(old_selected, .{});
    var ordinal: usize = 0;
    var number_offset: ?usize = null;
    while (try records.next()) |record| : (ordinal += 1) if (ordinal == selected) {
        try std.testing.expectEqual(@as(u10, 71), record.tag);
        try std.testing.expectEqual(@as(usize, 10), record.payload.len);
        number_offset = record.offset + record.raw.len - record.payload.len + 8;
    };
    const offset = number_offset orelse return error.MissingOwnRawWitness;
    for (old_selected, new_selected, 0..) |old, new, index| try std.testing.expectEqual(if (index == offset) @as(u8, 30) else if (index == offset + 1) @as(u8, 0) else old, new);
    try std.testing.expectEqualSlices(u8, try original.file.readStream(a, "/Opaque"), try result.file.readStream(a, "/Opaque"));
    try std.testing.expect(try h.undo(s));
    const undone = try s.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, undone.bytes);
    try std.testing.expect(!undone.layout_requires_reflow);
    try emitApprovedArtifact("h5-page-restart-undo.hwp", undone.bytes);
    try std.testing.expect(try h.redo(s));
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(redone.layout_requires_reflow);
    try emitApprovedArtifact("h5-page-restart-redo.hwp", redone.bytes);
    const reopened = try h5.Session.open(a, saved.bytes);
    defer reopened.close();
    const rows = try reopened.pageControlSources(a, 1);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(?u16, 30), rows[0].number);
    const fresh_default = try reopened.save(a, .{});
    defer a.free(fresh_default.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, fresh_default.bytes);
    try std.testing.expect(!fresh_default.layout_requires_reflow);
    try emitApprovedArtifact("h5-page-restart-reopened.hwp", fresh_default.bytes);
}
test "H5 PAGE restart History2 stale noop rejected fresh noop preserves redo and ticket" {
    const input = try fixture.h5(a, 1);
    defer a.free(input);
    const s = try h5.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try H5History.initV2(a, s, .{});
    defer h.deinit();
    const control = try fixture.h5Control(a, s, 0);
    const read = try h.pageRestart(s, a, 0, control);
    try std.testing.expect(try h.apply(s, .{ .edit_page_restart = .{ .before = read, .number = 9 } }));
    try std.testing.expect(try h.undo(s));
    try std.testing.expectError(error.StalePageRestartBinding, h.apply(s, .{ .edit_page_restart = .{ .before = read, .number = 7 } }));
    const fresh = try h.pageRestart(s, a, 0, control);
    const ticket = try s.historyTicket();
    try std.testing.expect(!try h.apply(s, .{ .edit_page_restart = .{ .before = fresh, .number = 7 } }));
    try std.testing.expectEqualDeep(ticket, try s.historyTicket());
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try std.testing.expect(try h.redo(s));
}
test "H5 PAGE restart History2 foreign owner direct Session and protocol1 refused" {
    const input = try fixture.h5(a, 1);
    defer a.free(input);
    const s = try h5.Session.open(a, input);
    defer s.close();
    const other = try h5.Session.open(a, input);
    defer other.close();
    s.enableHistoryDelta();
    other.enableHistoryDelta();
    var h = try H5History.initV2(a, s, .{});
    defer h.deinit();
    var foreign = try H5History.initV2(a, other, .{});
    defer foreign.deinit();
    const read = try foreign.pageRestart(other, a, 0, try fixture.h5Control(a, other, 0));
    const command: h5.Command = .{ .edit_page_restart = .{ .before = read, .number = 7 } };
    try std.testing.expectError(error.StalePageRestartBinding, h.apply(s, command));
    try std.testing.expectError(error.HistoryProtocol2Required, s.apply(command));
    var legacy = try H5History.init(a, s, 8, 16_000_000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(s, command));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "HX PAGE restart History2 default save reopen single commit and exact undo redo" {
    const input = try fixture.hx(a);
    defer a.free(input);
    var s = try hx.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try hx_history.History.initV2(&s, .{});
    defer h.deinit();
    const before = try s.save();
    defer a.free(before);
    const read = try h.pageRestart(&s, a, 0, try fixture.hxControl(&s));
    try std.testing.expectEqual(@as(usize, 2), read.paragraph);
    const request: @import("hwpx/page_restart_history.zig").Request = .{ .before = read, .number = 30 };
    try std.testing.expect(try h.apply(&s, hxCommand(&request)));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    const saved = try s.save();
    defer a.free(saved);
    var old_zip = try @import("zip/archive.zig").open(a, before, .{});
    defer old_zip.deinit();
    var new_zip = try @import("zip/archive.zig").open(a, saved, .{});
    defer new_zip.deinit();
    try std.testing.expectEqual(old_zip.entries.len, new_zip.entries.len);
    for (old_zip.entries, new_zip.entries) |old, new| {
        try std.testing.expectEqualStrings(old.name, new.name);
        const left = try old_zip.decode(old, 4_000_000);
        defer a.free(left);
        const right = try new_zip.decode(new, 4_000_000);
        defer a.free(right);
        if (!std.mem.eql(u8, old.name, "Contents/section0.xml")) {
            try std.testing.expectEqualSlices(u8, left, right);
            continue;
        }
        const needle = "<hp:newNum numType='PAGE' num='7'/>";
        const at = std.mem.indexOf(u8, left, needle) orelse return error.MissingOwnRawWitness;
        const expected = try std.mem.concat(a, u8, &.{ left[0..at], "<hp:newNum numType='PAGE' num='30'/>", left[at + needle.len ..] });
        defer a.free(expected);
        try std.testing.expectEqualSlices(u8, expected, right);
    }
    try std.testing.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    var reopened = try hx.open(a, saved, .{});
    defer reopened.deinit();
    const fresh = try @import("hwpx/page_restart_edit.zig").capture(a, &reopened.sections[0].tree, try fixture.hxControl(&reopened));
    try std.testing.expectEqual(@as(u16, 30), fresh.number);
}
test "HX PAGE restart History2 stale noop foreign scope and protocol1 refused" {
    const input = try fixture.hx(a);
    defer a.free(input);
    var s = try hx.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try hx_history.History.initV2(&s, .{});
    defer h.deinit();
    const read = try h.pageRestart(&s, a, 0, try fixture.hxControl(&s));
    var request: @import("hwpx/page_restart_history.zig").Request = .{ .before = read, .number = 9 };
    try std.testing.expect(try h.apply(&s, hxCommand(&request)));
    try std.testing.expect(try h.undo(&s));
    request.number = 7;
    try std.testing.expectError(error.StalePageRestartBinding, h.apply(&s, hxCommand(&request)));
    request.before = try h.pageRestart(&s, a, 0, try fixture.hxControl(&s));
    const serial = s.mutation_serial;
    try std.testing.expect(!try h.apply(&s, hxCommand(&request)));
    try std.testing.expectEqual(serial, s.mutation_serial);
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    var other = try hx.open(a, input, .{});
    defer other.deinit();
    other.history_delta_managed = true;
    var foreign = try hx_history.History.initV2(&other, .{});
    defer foreign.deinit();
    request.before = try foreign.pageRestart(&other, a, 0, try fixture.hxControl(&other));
    try std.testing.expectError(error.StalePageRestartBinding, h.apply(&s, hxCommand(&request)));
    var legacy = try hx_history.History.init(&s, 8, 16_000_000);
    defer legacy.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(&s, hxCommand(&request)));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}

fn h5AllocationAttempt(input: []const u8, point: usize) !bool {
    var failing = std.testing.FailingAllocator.init(a, .{});
    const allocator = failing.allocator();
    const s = try h5.Session.open(allocator, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try H5History.initV2(allocator, s, .{});
    defer h.deinit();
    const control = try fixture.h5Control(allocator, s, 0);
    const initial = try h.pageRestart(s, allocator, 0, control);
    try std.testing.expect(try h.apply(s, .{ .edit_page_restart = .{ .before = initial, .number = 9 } }));
    try std.testing.expect(try h.undo(s));
    const request: h5.Command = .{ .edit_page_restart = .{ .before = try h.pageRestart(s, allocator, 0, control), .number = 30 } };
    const before = try s.save(a, .{});
    defer a.free(before.bytes);
    failing.fail_index = failing.alloc_index + point;
    const changed = h.apply(s, request) catch |err| {
        failing.fail_index = std.math.maxInt(usize);
        if (err != error.OutOfMemory) return err;
        const after = try s.save(a, .{});
        defer a.free(after.bytes);
        try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
        try std.testing.expectEqual(@as(u32, 0), h.revision());
        try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
        try std.testing.expect(!h.stats().poisoned);
        try std.testing.expect(try h.redo(s));
        return false;
    };
    failing.fail_index = std.math.maxInt(usize);
    try std.testing.expect(changed);
    return true;
}
test "H5 PAGE restart History2 allocation rollback preserves source revision and redo" {
    const input = try fixture.h5(a, 1);
    defer a.free(input);
    for (0..8192) |point| if (try h5AllocationAttempt(input, point)) {
        try std.testing.expect(point > 0);
        return;
    };
    return error.PageRestartAllocationSweepBound;
}
fn hxAllocationAttempt(input: []const u8, point: usize) !bool {
    var failing = std.testing.FailingAllocator.init(a, .{});
    const allocator = failing.allocator();
    var s = try hx.open(allocator, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try hx_history.History.initV2(&s, .{});
    defer h.deinit();
    var request: @import("hwpx/page_restart_history.zig").Request = .{ .before = try h.pageRestart(&s, allocator, 0, try fixture.hxControl(&s)), .number = 9 };
    try std.testing.expect(try h.apply(&s, hxCommand(&request)));
    try std.testing.expect(try h.undo(&s));
    request.before = try h.pageRestart(&s, allocator, 0, try fixture.hxControl(&s));
    request.number = 30;
    const before = try s.save();
    defer allocator.free(before);
    failing.fail_index = failing.alloc_index + point;
    const changed = h.apply(&s, hxCommand(&request)) catch |err| {
        failing.fail_index = std.math.maxInt(usize);
        if (err != error.OutOfMemory) return err;
        const after = try s.save();
        defer allocator.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expectEqual(@as(u32, 0), h.revision());
        try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
        try std.testing.expect(!h.stats().poisoned);
        try std.testing.expect(try h.redo(&s));
        return false;
    };
    failing.fail_index = std.math.maxInt(usize);
    try std.testing.expect(changed);
    return true;
}
test "HX PAGE restart History2 allocation rollback preserves package revision and redo" {
    const input = try fixture.hx(a);
    defer a.free(input);
    for (0..8192) |point| if (try hxAllocationAttempt(input, point)) {
        try std.testing.expect(point > 0);
        return;
    };
    return error.PageRestartAllocationSweepBound;
}
