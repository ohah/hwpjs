//! Declared source regressions only until an exact Main Native grant.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const api = @import("note_delete.zig");
const fixtures = @import("note_delete_fixtures.zig");
const a = std.testing.allocator;
fn selector(session: *const editor.Session, note_kind: @import("note_mutation_owner.zig").Kind) !api.owners.Selector {
    for (session.sections, 0..) |section, ordinal| for (section.tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, if (note_kind == .foot) "footNote" else "endNote")) return .{ .section = ordinal, .note_node = node };
    };
    return error.MissingTestNote;
}
fn command(request: *const api.Request) histories.Command {
    return .{ .kind = .note_delete, .section = request.selector.section, .paragraph = request.paragraph, .start = @intCast(request.anchor_unit), .deleted = 0, .inserted = "", .note_delete = request };
}
fn lifecycle(allocator: std.mem.Allocator, input: []const u8, kind: @import("note_mutation_owner.zig").Kind) !void {
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const before = try session.save();
    defer allocator.free(before);
    const request = try api.owners.observe(allocator, &session, try selector(&session, kind), history.revision());
    const revision = history.revision();
    const source_pointer = session.source.ptr;
    const serial = session.mutation_serial;
    const changed = history.apply(&session, command(&request)) catch |err| {
        // Preserve the first failure and propagate OOM to the common sweep.
        // No failing-allocator save call can overwrite the original error here.
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expectEqual(serial, session.mutation_serial);
        try std.testing.expectEqual(source_pointer, session.source.ptr);
        return err;
    };
    try std.testing.expect(changed);
    try std.testing.expect(history.revision() != revision);
    const deleted = try session.save();
    defer allocator.free(deleted);
    var reopened = try editor.open(allocator, deleted, .{});
    defer reopened.deinit();
    try std.testing.expectError(error.MissingTestNote, selector(&reopened, kind));
    const resaved = try reopened.save();
    defer allocator.free(resaved);
    try std.testing.expectEqualSlices(u8, deleted, resaved);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    // Old tickets are stale even when undo restores the original source pointer.
    const undo_revision = history.revision();
    if (history.apply(&session, command(&request))) |_| return error.TestExpectedError else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == error.StaleNoteDeleteOwner);
    }
    try std.testing.expectEqual(undo_revision, history.revision());
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, deleted, redone);
}
test "HWPX N02 atomic footnote delete single edge undo redo save reopen" {
    const input = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(input);
    try lifecycle(a, input, .foot);
}
test "HWPX N02 atomic endnote delete single edge undo redo save reopen" {
    const input = try fixtures.create(a, fixtures.end, fixtures.continuous);
    defer a.free(input);
    try lifecycle(a, input, .end);
}
test "HWPX N02 nonfirst section deletion retains its real physical ordinal" {
    const input = try fixtures.twoSections(a, fixtures.foot);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const selected = try selector(&session, .foot);
    try std.testing.expectEqual(@as(usize, 1), selected.section);
    try lifecycle(a, input, .foot);
}
test "HWPX N02 atomic delete allocation failures retain owner history and immutable input" {
    const input = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(input);
    const digest = @import("note_removal_plan.zig").digest(input);
    try @import("../testing/allocation_failures.zig").check(lifecycle, .{ input, @import("note_mutation_owner.zig").Kind.foot });
    try std.testing.expectEqual(digest, @import("note_removal_plan.zig").digest(input));
}
test "HWPX N02 current number source proof and session binding are revalidated" {
    const input = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const request = try api.owners.observe(a, &session, try selector(&session, .foot), history.revision());
    const revision = history.revision();
    var wrong = request;
    wrong.number += 1;
    try std.testing.expectError(error.StaleNoteDeleteOwner, history.apply(&session, command(&wrong)));
    wrong = request;
    wrong.note_tag_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleNoteDeleteOwner, history.apply(&session, command(&wrong)));
    wrong = request;
    wrong.number_tag_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleNoteDeleteOwner, history.apply(&session, command(&wrong)));
    wrong = request;
    wrong.inventory_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleNoteDeleteOwner, history.apply(&session, command(&wrong)));
    wrong = request;
    wrong.session_address ^= 1;
    try std.testing.expectError(error.StaleNoteDeleteOwner, history.apply(&session, command(&wrong)));
    try std.testing.expectEqual(revision, history.revision());
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
test "HWPX N02 continuous footnote deletion renumbers two to one and preserves resources" {
    try renumberCase(a, .foot);
}
test "HWPX N02 continuous endnote deletion renumbers two to one and preserves resources" {
    try renumberCase(a, .end);
}
fn renumberCase(allocator: std.mem.Allocator, kind: @import("note_mutation_owner.zig").Kind) !void {
    const input = try fixtures.create(allocator, if (kind == .foot) fixtures.foot ++ fixtures.foot_second else fixtures.end ++ fixtures.end_second, fixtures.continuous);
    defer allocator.free(input);
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const before = try session.save();
    defer allocator.free(before);
    const request = try api.owners.observe(allocator, &session, try selector(&session, kind), history.revision());
    const revision = history.revision();
    const serial = session.mutation_serial;
    const source_pointer = session.source.ptr;
    const changed = history.apply(&session, command(&request)) catch |err| {
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expectEqual(serial, session.mutation_serial);
        try std.testing.expectEqual(source_pointer, session.source.ptr);
        try std.testing.expectEqualSlices(u8, input, session.source);
        return err;
    };
    try std.testing.expect(changed);
    const after = try session.save();
    defer allocator.free(after);
    var reopened = try editor.open(allocator, after, .{});
    defer reopened.deinit();
    const retained = try api.owners.observe(allocator, &reopened, try selector(&reopened, kind), 0);
    try std.testing.expectEqual(@as(i32, 1), retained.number);
    var original_zip = try @import("../zip/archive.zig").open(allocator, before, .{});
    defer original_zip.deinit();
    var edited_zip = try @import("../zip/archive.zig").open(allocator, after, .{});
    defer edited_zip.deinit();
    for (original_zip.entries) |entry| {
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) continue;
        const original_part = try original_zip.decode(entry, 4_000_000);
        defer allocator.free(original_part);
        const edited_part = try edited_zip.decode(edited_zip.find(entry.name) orelse return error.TestExpectedPart, 4_000_000);
        defer allocator.free(edited_part);
        try std.testing.expectEqualSlices(u8, original_part, edited_part);
    }
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "HWPX N02 continuous renumber allocation failures preserve a single history owner" {
    try @import("../testing/allocation_failures.zig").check(renumberCase, .{@import("note_mutation_owner.zig").Kind.foot});
}
test "HWPX N02 deletion keeps the independent other note numbering family" {
    const input = try fixtures.create(a, fixtures.foot ++ fixtures.end, fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const request = try api.owners.observe(a, &session, try selector(&session, .foot), 0);
    const before = try session.save();
    defer a.free(before);
    var deleted = try api.prepare(a, before, request, .{});
    defer deleted.deinit();
    const retained = try api.owners.observe(a, &deleted, try selector(&deleted, .end), 0);
    try std.testing.expectEqual(@as(i32, 1), retained.number);
}
test "HWPX N02 unsupported page restart policy is explicit without fallback" {
    const input = try fixtures.create(a, fixtures.foot, "<hp:footNotePr><hp:numbering type='ON_PAGE' newNum='1'/></hp:footNotePr>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expectError(error.UnsupportedNoteNumberPolicy, api.owners.observe(a, &session, try selector(&session, .foot), 0));
}
test "HWPX N02 note deletion cannot bypass managed history protocol" {
    const input = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try histories.History.init(&session, 8, 1_000_000);
    defer history.deinit();
    const request = try api.owners.observe(a, &session, try selector(&session, .foot), history.revision());
    try std.testing.expectError(error.HistoryProtocol2Required, history.apply(&session, command(&request)));
}
test "HWPX N02 selected note field opaque body and lock remain protected" {
    for ([_][]const u8{
        "<hp:ctrl><hp:footNote id=''><hp:subList><hp:p paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='FOOTNOTE'/></hp:ctrl><hp:ctrl><hp:fieldBegin id='1' type='HYPERLINK'/></hp:ctrl><hp:t>retain</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>",
        "<hp:ctrl><hp:footNote id=''><hp:subList><hp:p paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='FOOTNOTE'/></hp:ctrl><x:opaque xmlns:x='urn:opaque'/><hp:t>retain</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>",
    }) |marker| {
        const input = try fixtures.create(a, marker, fixtures.continuous);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        try std.testing.expectError(error.UnsupportedNoteDeleteBody, api.owners.observe(a, &session, try selector(&session, .foot), 0));
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
    }
    const input = try fixtures.create(a, "<hp:ctrl><hp:footNote id='' lock='1'><hp:subList><hp:p paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='FOOTNOTE'/></hp:ctrl><hp:t>retain</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>", fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expectError(error.NoteDeleteReadOnly, api.owners.observe(a, &session, try selector(&session, .foot), 0));
}
test "HWPX N02 pending note text is preserved by deletion undo through saved owner revalidation" {
    const input = try fixtures.create(a, fixtures.foot, fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const rows = try @import("paragraph_text_snapshot.zig").read(a, &session, 0);
    defer @import("paragraph_text_snapshot.zig").free(a, rows);
    var note_paragraph: ?usize = null;
    for (rows) |row| {
        if (std.mem.eql(u8, row.text, "각주 본문😀")) note_paragraph = row.paragraph;
    }
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = note_paragraph orelse return error.MissingTestNoteBody, .start = 0, .deleted = 0, .inserted = "변경&😀" }));
    const edited = try session.save();
    defer a.free(edited);
    const request = try api.owners.observe(a, &session, try selector(&session, .foot), history.revision());
    try std.testing.expect(try history.apply(&session, command(&request)));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, edited, restored);
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
}
test "HWPX N02 inconsistent source sequence fails without a partial history commit" {
    const input = try fixtures.create(a, fixtures.foot ++ fixtures.foot, fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const request = try api.owners.observe(a, &session, try selector(&session, .foot), history.revision());
    const revision = history.revision();
    const serial = session.mutation_serial;
    try std.testing.expectError(error.InconsistentNoteNumberSequence, history.apply(&session, command(&request)));
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(serial, session.mutation_serial);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
