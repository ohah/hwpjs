const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const checkpoints = @import("editor_checkpoint.zig");
const model = @import("../model/created_table.zig");
const staging = @import("created_table_session.zig");

fn table(a: std.mem.Allocator) !model.Table {
    var value = try model.create(a, 1, 33, try @import("../model/table_creation_plan.zig").create(1, 1, 101, 17, 1), &.{1000000}, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 1);
    errdefer value.deinit(a);
    _ = try value.replaceText(a, 0, 0, "셀😀", 100);
    return value;
}
fn input(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
}
fn command(value: *const model.Table) histories.Command {
    return .{ .kind = .created_table_stage, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .created_table = value };
}

test "created table ID plans reserve only on committed table and share current inventory" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var ids = try @import("created_table_source_ids.zig").plan(&session, 4);
    defer ids.deinit(a);
    var repeated = try @import("created_table_source_ids.zig").plan(&session, 4);
    defer repeated.deinit(a);
    try std.testing.expectEqual(ids.identity, repeated.identity);
    try std.testing.expectEqual(ids.instance_id, repeated.instance_id);
    try std.testing.expectEqualSlices(u32, ids.paragraph_ids, repeated.paragraph_ids);
    var value = try model.create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(2, 2, 101, 17, 4), ids.paragraph_ids, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 4);
    defer value.deinit(a);
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &value));
    var following = try @import("created_table_source_ids.zig").plan(&session, 4);
    defer following.deinit(a);
    try std.testing.expect(following.identity != ids.identity);
    try std.testing.expect(following.instance_id != ids.instance_id);
    for (following.paragraph_ids) |id| try std.testing.expect(std.mem.indexOfScalar(u32, ids.paragraph_ids, id) == null);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table staged resources reject dangling references before mutation" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    const original = value.resources;
    inline for (.{ .{ "paragraph", error.InvalidParagraphShapeReference }, .{ "character", error.InvalidCharacterShapeReference }, .{ "style", error.InvalidStyleReference }, .{ "border_fill", error.InvalidBorderFillReference } }) |item| {
        value.resources = original;
        @field(value.resources, item[0]) = std.math.maxInt(u32);
        try std.testing.expectError(item[1], staging.stage(&session, 0, 2, 0, &value));
        try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    value.resources = original;
    try std.testing.expect(try session.setParagraphAlignment(0, 2, .CENTER));
    value.resources.paragraph = try session.paragraphShapeId(0, 2);
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 1, .{ .size = 1234 }));
    try std.testing.expect(session.character_resources.entries.items.len > 0);
    value.resources.character = session.character_resources.entries.items[session.character_resources.entries.items.len - 1].id;
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &value));
}

test "created table staged IDs reject split source and previous cell collisions atomically" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
        const raw = (try session.sections[0].tree.attributeValue(a, index, "", "id")) orelse continue;
        const id_text = try raw.toUtf8(a, 4096);
        defer a.free(id_text);
        const source_id = try @import("xml_values.zig").unsigned32(id_text);
        value.cells[0].paragraph_id = source_id;
        try std.testing.expectError(error.InvalidParagraphInstanceId, staging.stage(&session, 0, 2, 0, &value));
        break;
    }
    value.cells[0].paragraph_id = 1000000;
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const generated = session.sections[0].structure_values.?.paragraphs[2].generated_id.?;
    value.cells[0].paragraph_id = generated;
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.InvalidParagraphInstanceId, staging.stage(&session, 0, 2, 0, &value));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    value.cells[0].paragraph_id = 1000000;
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &value));
    var parts = [_]editor.Section{ session.sections[0], session.sections[0] };
    parts[0].created_tables = .{};
    var borrowed = session;
    borrowed.sections = &parts;
    try std.testing.expectError(error.InvalidCreatedTableIdentity, @import("created_table_object_ids.zig").validateCurrent(&borrowed, 1, 34));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, @import("created_table_object_ids.zig").validateCurrent(&borrowed, 2, 33));
    try @import("created_table_object_ids.zig").validateCurrent(&borrowed, 2, 34);
    value.identity = 2;
    value.instance_id = 34;
    try std.testing.expectError(error.InvalidParagraphInstanceId, staging.stage(&session, 0, 2, 0, &value));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].created_tables.entries.items.len);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table staged history owns text anchor saves reopens and preserves redo" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    var history = try histories.History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, command(&value)));
    const anchor = session.sections[0].created_tables.entries.items[0].anchor;
    _ = try value.replaceText(a, 0, 0, "외부", 100);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const cell_text = try reopened.anchorText(0, 3);
    defer a.free(cell_text);
    try std.testing.expectEqualStrings("셀😀", cell_text);
    try std.testing.expect(try reopened.canEdit(0, 3));
    try std.testing.expect(try reopened.splice(0, 3, 0, 0, "다시 "));
    const changed_text = try reopened.anchorText(0, 3);
    defer a.free(changed_text);
    try std.testing.expectEqualStrings("다시 셀😀", changed_text);
    try std.testing.expect(!try session.splice(0, 2, 0, 0, ""));
    try std.testing.expect(!try session.spliceAnchored(0, 2, 0, 0, ""));
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.splitParagraph(0, 2, 0, 0));
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.mergeParagraph(0, 2));
    try std.testing.expect(!try session.canSplitParagraph(0, 2, 0, 0));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    const bad: histories.Command = .{ .section = 99, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    try std.testing.expectError(error.InvalidSectionIndex, history.applyBatch(&session, &.{ command(&value), bad }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expectEqualDeep(anchor, session.sections[0].created_tables.entries.items[0].anchor);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "created table staged checkpoint includes memory and failed budget rolls back" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    const baseline = try checkpoints.size(&session, 4000000);
    var history = try histories.History.init(&session, 4, baseline);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command(&value)));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &value));
    try std.testing.expect(try checkpoints.size(&session, 4000000) > baseline);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var borrowed = source.*;
            borrowed.allocator = allocator;
            var checkpoint = try checkpoints.capture(&borrowed, 4000000);
            defer checkpoint.deinit();
            try std.testing.expectEqualStrings("셀😀", checkpoint.states[0].created_tables.entries.items[0].table.cells[0].text);
        }
    }.run, .{&session});
    var checkpoint = try checkpoints.capture(&session, 4000000);
    defer checkpoint.deinit();
    _ = try session.sections[0].created_tables.entries.items[0].table.replaceText(a, 0, 0, "변경", 100);
    try checkpoint.exchange(&session);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    try checkpoint.exchange(&session);
    try std.testing.expectEqualStrings("변경", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
}

test "created table staged allocation failures retain empty current state and source" {
    try @import("../testing/checked_allocator.zig").run(stagedAllocationFailures, .{});
}

fn stagedAllocationFailures(a: std.mem.Allocator) !void {
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, payload: *const model.Table) !void {
            var borrowed = source.*;
            borrowed.allocator = allocator;
            // Only the empty registry is shared with the source. Restore it on
            // every exit; never deinit the borrowed session/XML/site owners.
            defer {
                borrowed.sections[0].created_tables.deinit(allocator);
                borrowed.sections[0].created_tables = .{};
            }
            errdefer std.debug.assert(borrowed.sections[0].created_tables.entries.items.len == 0);
            try std.testing.expect(try staging.stage(&borrowed, 0, 2, 0, payload));
        }
    }.run, .{ &session, &value });
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
