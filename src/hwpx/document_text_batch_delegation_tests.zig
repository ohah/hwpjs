const std = @import("std");
const editor = @import("editor_session.zig");
const issuer: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
const stamp: @import("../model/document_text_read_binding.zig").Stamp = .{ .epoch = 7, .serial = 13 };
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>A<p:tab/>B<p:lineBreak/>C</p:t></p:run></p:p></s:sec>";
test "document text batch delegation snapshot consumes actual kernel visible controls rather than plain Sites" {
    const a = std.testing.allocator;
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, issuer, null);
    defer observed.deinit();
    try std.testing.expectEqual(@as(usize, 1), observed.snapshot.rows.items.len);
    try std.testing.expectEqualStrings("A\tB\nC", observed.snapshot.rows.items[0].text);
    try observed.snapshot.bindReadStamp(stamp);
    try observed.assertCurrent(&session);
}
test "document text batch delegation caret and selection share the current kernel axis and Native read ref" {
    const a = std.testing.allocator;
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, issuer, null);
    defer observed.deinit();
    try observed.snapshot.bindReadStamp(stamp);
    var selection = try @import("document_text_selection.zig").query(a, &session, issuer, null, .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .ref = observed.snapshot.rows.items[0].ref,
        .start = 1,
        .end = 2,
        .expected = "\t",
    });
    defer selection.deinit();
    try std.testing.expectEqualStrings("A\tB\nC", selection.before_text);
    var anchor = try @import("document_text_anchor.zig").query(a, &session, issuer, null, .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .section = 0,
        .target = .{ .paragraph = .{ .paragraph = 1 } },
        .unit = 3,
        .before_text = "A\tB\nC",
    });
    defer anchor.deinit();
    try std.testing.expectEqualStrings(observed.snapshot.rows.items[0].ref, anchor.ref);
    try std.testing.expectEqual(@as(u32, 3), anchor.unit);
}

test "document text batch delegation wire versions preserve legacy serial and identify external-generation v2" {
    const a = std.testing.allocator;
    const reply = @import("../wasm/control_text_read_reply.zig");
    const rows = [_]reply.Row{.{ .paragraph = 37, .sourceNode = 1, .plain = "x", .text = "x", .units = 1, .controls = &.{}, .coverage = .complete, .issue = null }};
    const old = try reply.write(a, 1, "s7", "0", &rows, 4096);
    defer a.free(old);
    const current = try reply.writeCurrent(a, 1, "s7", "13", &rows, 4096);
    defer a.free(current);
    var old_json = try std.json.parseFromSlice(std.json.Value, a, old, .{});
    defer old_json.deinit();
    var current_json = try std.json.parseFromSlice(std.json.Value, a, current, .{});
    defer current_json.deinit();
    try std.testing.expectEqual(@as(i64, 1), old_json.value.object.get("schemaVersion").?.integer);
    try std.testing.expectEqual(@as(i64, 2), current_json.value.object.get("schemaVersion").?.integer);
    try std.testing.expectEqualStrings("0", old_json.value.object.get("readStamp").?.object.get("serial").?.string);
    try std.testing.expectEqualStrings("13", current_json.value.object.get("readStamp").?.object.get("serial").?.string);
    try std.testing.expectEqual(@as(i64, 37), current_json.value.object.get("rows").?.array.items[0].object.get("paragraph").?.integer);
}
test "document text batch delegation FFI first ordinal rejects zero and retains Native first plus index" {
    const a = std.testing.allocator;
    const kernel = @import("control_text_read_context.zig");
    const reply = @import("../wasm/control_text_read_reply.zig");
    const rows = [_]kernel.Row{
        .{ .currentIndex = 0, .sourceNode = 1, .plain = "x", .text = "x", .units = 1, .controls = &.{}, .segments = &.{}, .coverage = .complete, .issue = null },
        .{ .currentIndex = 1, .sourceNode = 2, .plain = "y", .text = "y", .units = 1, .controls = &.{}, .segments = &.{}, .coverage = .complete, .issue = null },
    };
    var context: kernel.Context = .{ .arena = std.heap.ArenaAllocator.init(a), .rows = &rows, .paragraphs = &.{}, .by_owner = .empty, .counters = .{} };
    defer context.deinit();
    try std.testing.expectError(error.SourceBindingMismatch, reply.rows(a, 0, &context));
    const values = try reply.rows(a, 37, &context);
    defer a.free(values);
    try std.testing.expectEqual(@as(u32, 37), values[0].paragraph);
    try std.testing.expectEqual(@as(u32, 38), values[1].paragraph);
    try std.testing.expectError(error.LimitExceeded, reply.rows(a, std.math.maxInt(u32), &context));
}

// Actual Session callers, not a Context constructed with a test-only policy.
test "document text batch delegation Session selected branches reach all four callers without inactive field contamination" {
    const a = std.testing.allocator;
    const section_xml = @embedFile("test_fixtures/document_text_selected_run.xml");
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, section_xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime = issuer;
    const before_bytes = try session.save();
    defer a.free(before_bytes);
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, lifetime, history.revision());
    defer observed.deinit();
    try observed.snapshot.bindReadStamp(stamp);
    try std.testing.expectEqual(@as(usize, 2), observed.snapshot.rows.items.len);
    try std.testing.expectEqualStrings("KEEP", observed.snapshot.rows.items[1].text);
    var active: ?*const @import("../model/document_text_snapshot.zig").Row = null;
    for (observed.snapshot.rows.items) |*row| {
        try std.testing.expect(std.mem.indexOf(u8, row.text, "DECOY") == null);
        if (std.mem.eql(u8, row.text, "BASELABEL")) active = row;
    }
    const row = active orelse return error.MissingActiveDocumentTextRow;
    var selection = try @import("document_text_selection.zig").query(a, &session, lifetime, history.revision(), .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .ref = row.ref,
        .start = 0,
        .end = 4,
        .expected = "BASE",
    });
    defer selection.deinit();
    try std.testing.expectEqualStrings("BASELABEL", selection.before_text);
    const paragraph = switch (selection.target) {
        .paragraph => |point| point.paragraph,
        else => return error.UnexpectedDocumentTextTarget,
    };
    var anchor = try @import("document_text_anchor.zig").query(a, &session, lifetime, history.revision(), .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .section = 0,
        .target = .{ .paragraph = .{ .paragraph = paragraph } },
        .unit = 1,
        .before_text = "BASELABEL",
    });
    defer anchor.deinit();
    try std.testing.expectEqualStrings(row.ref, anchor.ref);
    const name = try lifetime.session(a);
    defer a.free(name);
    const service: @import("document_replace_all.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = name, .revision = history.revision() }, .query = "BASE", .replacement = "NEXT" }));
    var after = try @import("document_text_snapshot.zig").observe(a, &session, lifetime, history.revision());
    defer after.deinit();
    var found = false;
    for (after.snapshot.rows.items) |after_row| {
        if (std.mem.eql(u8, after_row.text, "NEXTLABEL")) found = true;
    }
    try std.testing.expect(found);
    const after_bytes = try session.save();
    defer a.free(after_bytes);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before_bytes, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after_bytes, redone);
}

comptime {
    _ = @import("selected_run_owner_tests.zig");
    _ = @import("document_text_field_source_tests.zig");
}
