//! Actual synthetic Native Session/History contracts; no external fixtures.
const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const Fixture = @import("document_text_test_fixture.zig").Fixture;
const State = @import("../model/formatting_binding.zig").State;
const Service = @import("document_replace_all.zig").Service;

test "document text HX whole source and pending cells retain one Native undo redo and canonical saved owners" {
    const fixture = try Fixture.create(a, 2);
    defer fixture.deinit();
    var state: State = .{};
    try state.open();
    const name = try state.session(a);
    defer a.free(name);
    const service: Service = .{ .session = &fixture.session, .history = &fixture.history, .lifetime = &state };
    const before = try fixture.session.save();
    defer a.free(before);
    const revision = fixture.history.revision();
    const count = fixture.history.revisionCount();
    const request: @import("../model/document_replace_all.zig").Request = .{
        .binding = .{ .session = name, .revision = revision },
        .query = "needle",
        .replacement = "한",
    };
    try std.testing.expect(try service.apply(a, request));
    try std.testing.expectEqual(revision + 1, fixture.history.revision());
    try std.testing.expectEqual(count + 1, fixture.history.revisionCount());
    var read = try @import("document_text_inventory.zig").read(a, &fixture.session);
    defer read.deinit();
    try std.testing.expectEqualStrings("한", read.sections[0].sources[0].text);
    try std.testing.expectEqualStrings("😀", read.sections[0].sources[1].text);
    try std.testing.expectEqualStrings("한", read.sections[0].cells[0].text);
    try std.testing.expectEqualStrings("한", read.sections[0].cells[1].text);
    try std.testing.expectEqual(fixture.table_identity, fixture.session.sections[0].created_tables.entries.items[0].table.identity);
    const after = try fixture.session.save();
    defer a.free(after);
    var reopened = try editor.open(a, after, fixture.session.options);
    defer reopened.deinit();
    var observed = try @import("document_text_snapshot.zig").read(a, &reopened, state, null);
    defer observed.deinit();
    try std.testing.expectEqual(@as(usize, 4), observed.rows.items.len);
    try std.testing.expectEqualStrings("한", observed.rows.items[0].text);
    try std.testing.expectEqualStrings("한", observed.rows.items[2].text);
    try std.testing.expectEqualStrings("한", observed.rows.items[3].text);
    try std.testing.expect(try fixture.history.undo(&fixture.session));
    const undone = try fixture.session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try fixture.history.redo(&fixture.session));
    const redone = try fixture.session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    try std.testing.expectError(error.StaleFormattingBinding, service.apply(a, request));
}

test "document text HX generated host replacement rebases pending table without materializing its owner" {
    const fixture = try Fixture.create(a, 1);
    defer fixture.deinit();
    var state: State = .{};
    try state.open();
    const name = try state.session(a);
    defer a.free(name);
    const anchor = fixture.session.sections[0].created_tables.entries.items[0].anchor;
    const service: Service = .{ .session = &fixture.session, .history = &fixture.history, .lifetime = &state };
    try std.testing.expect(try service.apply(a, .{
        .binding = .{ .session = name, .revision = fixture.history.revision() },
        .query = "😀",
        .replacement = "한",
    }));
    const entry = fixture.session.sections[0].created_tables.entries.items[0];
    try std.testing.expectEqual(fixture.table_identity, entry.table.identity);
    try std.testing.expectEqualDeep(anchor.paragraph, entry.anchor.paragraph);
    try std.testing.expectEqual(@as(u32, 1), entry.anchor.unit);
    var read = try @import("document_text_snapshot.zig").read(a, &fixture.session, state, fixture.history.revision());
    defer read.deinit();
    try std.testing.expectEqualStrings("한\xef\xbf\xbc", read.rows.items[1].text);
    try std.testing.expect(read.rows.items[2].source == .created_cell);
    try std.testing.expectEqualStrings("needle", read.rows.items[2].text);
}

test "document text HX protected object match refuses whole batch and preserves redo and lifetime fences" {
    const fixture = try Fixture.create(a, 1);
    defer fixture.deinit();
    var state: State = .{};
    try state.open();
    const name = try state.session(a);
    defer a.free(name);
    const service: Service = .{ .session = &fixture.session, .history = &fixture.history, .lifetime = &state };
    try std.testing.expect(try service.apply(a, .{
        .binding = .{ .session = name, .revision = fixture.history.revision() },
        .query = "needle",
        .replacement = "changed",
    }));
    const changed = try fixture.session.save();
    defer a.free(changed);
    try std.testing.expect(try fixture.history.undo(&fixture.session));
    const revision = fixture.history.revision();
    const count = fixture.history.revisionCount();
    const before = try fixture.session.save();
    defer a.free(before);
    const request: @import("../model/document_replace_all.zig").Request = .{
        .binding = .{ .session = name, .revision = revision },
        .query = "\xef\xbf\xbc",
        .replacement = "",
    };
    try std.testing.expectError(error.ProtectedPendingObjectBoundary, service.apply(a, request));
    try std.testing.expectEqual(revision, fixture.history.revision());
    try std.testing.expectEqual(count, fixture.history.revisionCount());
    const refused = try fixture.session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, before, refused);
    try state.open();
    try std.testing.expectError(error.StaleFormattingBinding, service.apply(a, request));
    try std.testing.expect(try fixture.history.redo(&fixture.session));
    const redone = try fixture.session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}

fn privateCase(allocator: std.mem.Allocator, original: *const editor.Session, state: State, revision: u32) !void {
    // Borrow immutable/current inputs. Every read/save/open and candidate
    // allocation uses the injected provider. Never publish or deinit the view.
    var view = original.*;
    view.allocator = allocator;
    var observation = try @import("document_text_snapshot.zig").observe(allocator, &view, state, revision);
    defer observation.deinit();
    var context = try @import("independent_text_session.zig").Context.initForDocument(&view, &observation);
    defer context.deinit();
    try std.testing.expectError(error.DocumentTextWholePublicationRequired, context.finish());
    var plan = try @import("../model/document_replace_all.zig").prepare(allocator, &observation.snapshot, .{
        .binding = observation.snapshot.binding,
        .query = "needle",
        .replacement = "한",
    });
    defer plan.deinit();
    var prepared = try @import("document_text_session.zig").prepare(&view, &observation, &plan);
    defer prepared.deinit();
    try std.testing.expect(prepared.changed);
    try std.testing.expectError(error.IndependentTextRequiresHistory, prepared.commit());
}

test "document text HX whole detached source cell candidate retains legacy guard and no publication through OOM" {
    const fixture = try Fixture.create(a, 2);
    defer fixture.deinit();
    var state: State = .{};
    try state.open();
    const before = try fixture.session.save();
    defer a.free(before);
    const revision = fixture.history.revision();
    try std.testing.expectError(error.UnsupportedIndependentCreatedTableMetadata, @import("independent_text_session.zig").Context.init(&fixture.session));
    try privateCase(a, &fixture.session, state, revision);
    try @import("../testing/allocation_failures.zig").check(privateCase, .{ @as(*const editor.Session, &fixture.session), state, revision });
    const after = try fixture.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, fixture.history.revision());
}

fn pageInput(allocator: std.mem.Allocator) ![]u8 {
    return @import("document_text_test_fixture.zig").inputWithSection(allocator, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle</p:t><p:ctrl><p:header><p:subList>" ++
        "<p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle</p:t></p:run></p:p>" ++
        "</p:subList></p:header></p:ctrl><p:t>needle</p:t><p:ctrl><p:footer><p:subList>" ++
        "<p:p id='3' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle</p:t></p:run></p:p>" ++
        "</p:subList></p:footer></p:ctrl></p:run></p:p></s:sec>");
}

test "document text HX whole title replacement retains one Native undo and actual saved marker" {
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle😀<p:titleMark ignore='false'/>needle</p:t></p:run></p:p></s:sec>");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var state: State = .{};
    try state.open();
    const name = try state.session(a);
    defer a.free(name);
    const service: Service = .{ .session = &session, .history = &history, .lifetime = &state };
    const count = history.revisionCount();
    try std.testing.expect(try service.apply(a, .{
        .binding = .{ .session = name, .revision = history.revision() },
        .query = "needle",
        .replacement = "한",
    }));
    try std.testing.expectEqual(count + 1, history.revisionCount());
    var snapshot = try @import("document_text_snapshot.zig").read(a, &session, state, history.revision());
    defer snapshot.deinit();
    try std.testing.expectEqualStrings("한😀한", snapshot.rows.items[0].text);
    const paragraph = &session.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 1), paragraph.title_positions.?.len);
    try std.testing.expectEqual(@as(usize, 4), paragraph.title_positions.?[0].unit);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var after = try @import("document_text_snapshot.zig").read(a, &reopened, state, null);
    defer after.deinit();
    try std.testing.expectEqualStrings(snapshot.rows.items[0].text, after.rows.items[0].text);
    var native = try @import("display_current_paragraphs.zig").read(a, &reopened.sections[0], reopened.options);
    defer native.deinit(a);
    const titles = try @import("title_mark_current.zig").read(a, &reopened.sections[0].tree, &native.paragraphs[0]);
    defer a.free(titles);
    try std.testing.expectEqual(@as(usize, 1), titles.len);
    try std.testing.expectEqual(@as(usize, 4), titles[0].unit);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, bytes, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "document text HX whole page owner header and footer text retain declaration identities in one undo" {
    const bytes = try pageInput(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var state: State = .{};
    try state.open();
    const name = try state.session(a);
    defer a.free(name);
    const service: Service = .{ .session = &session, .history = &history, .lifetime = &state };
    const count = history.revisionCount();
    try std.testing.expect(try service.apply(a, .{
        .binding = .{ .session = name, .revision = history.revision() },
        .query = "needle",
        .replacement = "한",
    }));
    try std.testing.expectEqual(count + 1, history.revisionCount());
    var snapshot = try @import("document_text_snapshot.zig").read(a, &session, state, history.revision());
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(usize, 3), snapshot.rows.items.len);
    try std.testing.expectEqualStrings("한한", snapshot.rows.items[0].text);
    try std.testing.expectEqualStrings("한", snapshot.rows.items[1].text);
    try std.testing.expectEqualStrings("한", snapshot.rows.items[2].text);
    const owner = &session.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 2), owner.page_area_positions.?.len);
    try std.testing.expectEqual(@as(u32, 2), owner.page_area_positions.?[0].unit);
    try std.testing.expectEqual(@as(u32, 2), owner.page_area_positions.?[1].unit);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var read = try @import("document_text_snapshot.zig").read(a, &reopened, state, null);
    defer read.deinit();
    for (snapshot.rows.items, read.rows.items) |expected, actual| try std.testing.expectEqualStrings(expected.text, actual.text);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, bytes, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
