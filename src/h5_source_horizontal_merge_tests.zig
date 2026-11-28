const std = @import("std");
const testing = std.testing;
const a = testing.allocator;
const transform = @import("hwp5/edit/source_table_grid_file.zig");
const source_api = @import("hwp5/text_source.zig");
const wire = @import("hwp5/record.zig");

const options: @import("hwp5/edit/created_table_records.zig").Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "3×4" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};

const Fixture = struct {
    bytes: []u8,
    table_node: usize,
};

fn authored(covered_text: []const u8) !Fixture {
    const blank = try @import("new_document/hwp5.zig").create(a);
    defer a.free(blank);
    var source = try source_api.Source.open(a, blank);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    var table = try @import("model/created_table.zig").create(
        a,
        100,
        101,
        try @import("model/table_creation_plan.zig").create(3, 4, 40000, 8000, 12),
        &.{ 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 },
        .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 },
        12,
    );
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "left", 1024);
    _ = try table.replaceText(a, 0, 1, "앵커😀", 1024);
    _ = try table.replaceText(a, 0, 3, covered_text, 1024);
    _ = try table.replaceText(a, 2, 3, "tail", 1024);
    const resources: @import("hwp5/edit/created_table_records.zig").Resources = .{
        .paragraphs = .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 },
        .border_count = 0,
    };
    const limits: @import("hwp5/edit/created_table_records.zig").Limits = .{ .max_bytes = 32768, .max_cells = 12 };
    var pending = [_]@import("hwp5/edit/created_table_values.zig").Values{.{}};
    defer pending[0].deinit(a);
    try @import("hwp5/edit/created_table_stage.zig").apply(a, &.{raw}, &document, &pending, version, .{
        .section = 0,
        .paragraph = 0,
        .unit = 16,
        .table = &table,
        .options = options,
    }, resources, limits);
    const section = try @import("hwp5/edit/created_table_section.zig").write(a, raw, document.sections[0], &pending[0], version, resources, limits);
    defer a.free(section);
    var records = wire.Iterator.init(section, .{});
    var node: usize = 0;
    while (try records.next()) |record| : (node += 1) {
        if (record.tag == 77) return .{
            .bytes = try @import("cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", section, .{}),
            .table_node = node,
        };
    }
    return error.MissingAuthoredTable;
}

fn request(fixture: Fixture) transform.HorizontalMerge {
    return .{
        .section = 0,
        .table_node = fixture.table_node,
        .expected_rows = 3,
        .expected_columns = 4,
        .layout = .observed8,
        .selection = .{ .row = 0, .first_column = 1, .last_column = 3 },
    };
}

test "H5 source horizontal merge authored 3x4 preserves anchor siblings axes and streams" {
    const fixture = try authored("");
    defer a.free(fixture.bytes);
    const result = try transform.mergeHorizontal(a, fixture.bytes, request(fixture), .{});
    defer a.free(result);
    var before = try source_api.Source.open(a, fixture.bytes);
    defer before.deinit();
    var after = try source_api.Source.open(a, result);
    defer after.deinit();
    const old = try before.decodeSection(a, 0);
    defer a.free(old);
    const new = try after.decodeSection(a, 0);
    defer a.free(new);

    // Compare every serialized record. The three documented fields are the
    // only surviving bytes allowed to differ, including the entire anchor paragraph.
    var old_it = wire.Iterator.init(old, .{});
    var new_it = wire.Iterator.init(new, .{});
    var skip = false;
    var lists: usize = 0;
    while (try old_it.next()) |prior| {
        if (prior.tag == 72) {
            lists += 1;
            skip = lists == 3 or lists == 4;
        }
        if (skip) continue;
        const actual = (try new_it.next()) orelse return error.MissingSurvivingRecord;
        if (prior.tag == 77) {
            try testing.expectEqual(@as(u16, 3), std.mem.readInt(u16, actual.payload[4..6], .little));
            try testing.expectEqual(@as(u16, 4), std.mem.readInt(u16, actual.payload[6..8], .little));
            try testing.expectEqual(@as(u16, 2), std.mem.readInt(u16, actual.payload[18..20], .little));
            try testing.expectEqualSlices(u8, prior.raw[0 .. prior.raw.len - prior.payload.len + 18], actual.raw[0 .. actual.raw.len - actual.payload.len + 18]);
            try testing.expectEqualSlices(u8, prior.payload[20..], actual.payload[20..]);
        } else if (prior.tag == 72 and lists == 2) {
            try testing.expectEqual(@as(u16, 3), std.mem.readInt(u16, actual.payload[12..14], .little));
            try testing.expectEqual(@as(u32, 30000), std.mem.readInt(u32, actual.payload[16..20], .little));
            try testing.expectEqualSlices(u8, prior.raw[0 .. prior.raw.len - prior.payload.len + 12], actual.raw[0 .. actual.raw.len - actual.payload.len + 12]);
            try testing.expectEqualSlices(u8, prior.payload[14..16], actual.payload[14..16]);
            try testing.expectEqualSlices(u8, prior.payload[20..], actual.payload[20..]);
        } else {
            try testing.expectEqualSlices(u8, prior.raw, actual.raw);
        }
    }
    try testing.expectEqual(@as(usize, 12), lists);
    try testing.expect((try new_it.next()) == null);

    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, after.header.version(), &.{new});
    defer document.deinit(a);
    const bindings = try @import("hwp5/edit/table_display_bindings.zig").read(a, new, after.header.version(), document.sections[0].paragraphs);
    defer a.free(bindings);
    try testing.expectEqual(@as(usize, 10), bindings.len);
    try testing.expectEqual(@as(u16, 3), bindings[1].column_span);
    try testing.expectEqual(@as(u16, 1), bindings[1].row_span);
    for (before.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try before.file.rootRelativePath(index);
        if (std.mem.eql(u8, path, "/BodyText/Section0")) continue;
        const found = try after.file.findExact(path) orelse return error.MissingPreservedStream;
        try testing.expectEqualSlices(u8, entry.content, after.file.entries[found].content);
    }
}

test "H5 source horizontal merge refuses covered content and stale table dimensions" {
    const fixture = try authored("keep me");
    defer a.free(fixture.bytes);
    const original = try a.dupe(u8, fixture.bytes);
    defer a.free(original);
    const target = request(fixture);
    try testing.expectError(error.NonemptyCoveredSourceTableCell, transform.mergeHorizontal(a, fixture.bytes, target, .{}));
    var stale = target;
    stale.expected_columns = 3;
    try testing.expectError(error.SourceBindingMismatch, transform.mergeHorizontal(a, fixture.bytes, stale, .{}));
    try testing.expectEqualSlices(u8, original, fixture.bytes);
}

test "H5 source horizontal merge retains a disjoint previous merge and refuses overlap" {
    const fixture = try authored("");
    defer a.free(fixture.bytes);
    const first = request(fixture);
    const once = try transform.mergeHorizontal(a, fixture.bytes, first, .{});
    defer a.free(once);
    try testing.expectError(error.UnsupportedSourceTableGrid, transform.mergeHorizontal(a, once, first, .{}));
    var second = first;
    second.selection = .{ .row = 1, .first_column = 0, .last_column = 1 };
    const twice = try transform.mergeHorizontal(a, once, second, .{});
    defer a.free(twice);

    second.selection = .{ .row = 1, .first_column = 2, .last_column = 3 };
    const thrice = try transform.mergeHorizontal(a, twice, second, .{});
    defer a.free(thrice);
    var source = try source_api.Source.open(a, thrice);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const bindings = try @import("hwp5/edit/table_display_bindings.zig").read(a, raw, version, document.sections[0].paragraphs);
    defer a.free(bindings);
    try testing.expectEqual(@as(usize, 8), bindings.len);
    try testing.expectEqual(@as(u16, 3), bindings[1].column_span);
    try testing.expectEqual(@as(u16, 2), bindings[2].column_span);
    try testing.expectEqual(@as(u16, 2), bindings[3].column_span);
    try testing.expectEqual(@as(u16, 1), bindings[1].row_span);
    try testing.expectEqual(@as(u16, 1), bindings[2].row_span);
}

test "H5 source rectangle merge sums dimensions and refuses selection in a covered row" {
    const fixture = try authored("");
    defer a.free(fixture.bytes);
    var target = request(fixture);
    target.selection = .{ .row = 1, .last_row = 2, .first_column = 0, .last_column = 2 };
    var nonempty = target;
    nonempty.selection.last_column = 3;
    try testing.expectError(error.NonemptyCoveredSourceTableCell, transform.mergeHorizontal(a, fixture.bytes, nonempty, .{}));
    const merged = try transform.mergeHorizontal(a, fixture.bytes, target, .{});
    defer a.free(merged);

    var overlap = target;
    overlap.selection = .{ .row = 2, .first_column = 1, .last_column = 3 };
    try testing.expectError(error.UnsupportedSourceTableGrid, transform.mergeHorizontal(a, merged, overlap, .{}));

    var source = try source_api.Source.open(a, merged);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const inventory = try @import("hwp5/edit/source_table_plain_grid.zig").inspect(arena.allocator(), raw, source.header.version(), .{
        .table_node = fixture.table_node,
        .expected_rows = 3,
        .expected_columns = 4,
        .layout = .observed8,
    }, .{});
    try testing.expectEqual(@as(usize, 7), inventory.cells.len);
    const anchor = inventory.cells[4].value;
    try testing.expectEqual(@as(u16, 2), anchor.row_span);
    try testing.expectEqual(@as(u16, 3), anchor.column_span);
    try testing.expectEqual(@as(u32, 30000), anchor.width);
    try testing.expectEqual(@as(u32, 2 * 8000), anchor.height);
    try testing.expectEqual(@as(u16, 3), inventory.cells[6].value.column);
}

test "H5 source rectangle merge commits one history entry and reopens" {
    const fixture = try authored("");
    defer a.free(fixture.bytes);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const History = @import("hwp5/edit/editor_history.zig").History;
    const session = try Session.open(a, fixture.bytes);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    const edit: @import("hwp5/edit/source_table_grid_session.zig").Edit = .{
        .section = 0,
        .table_node = fixture.table_node,
        .expected_rows = 3,
        .expected_columns = 4,
        .layout = .observed8,
        .merge = .{ .row = 1, .last_row = 2, .first_column = 0, .last_column = 2 },
    };
    try testing.expect(try history.apply(session, .{ .edit_source_table_grid = edit }));
    try testing.expectEqual(@as(u32, 1), history.revision());
    const merged = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(merged.bytes);
    const reopened = try Session.open(a, merged.bytes);
    defer reopened.close();
    const bindings = try reopened.tableBindings(a, 0);
    defer a.free(bindings);
    try testing.expectEqual(@as(usize, 7), bindings.len);
    try testing.expectEqual(@as(u16, 2), bindings[4].row_span);
    try testing.expectEqual(@as(u16, 3), bindings[4].column_span);
    try testing.expect(try history.undo(session));
    const undo = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try testing.expectEqualSlices(u8, baseline.bytes, undo.bytes);
    var rejected = edit;
    rejected.merge.?.last_column = 3;
    const before_rejection = history.stats();
    try testing.expectError(error.NonemptyCoveredSourceTableCell, history.apply(session, .{ .edit_source_table_grid = rejected }));
    try testing.expectEqualDeep(before_rejection, history.stats());
    const preserved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(preserved.bytes);
    try testing.expectEqualSlices(u8, undo.bytes, preserved.bytes);
    try testing.expect(try history.redo(session));
    const redo = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try testing.expectEqualSlices(u8, merged.bytes, redo.bytes);
}
