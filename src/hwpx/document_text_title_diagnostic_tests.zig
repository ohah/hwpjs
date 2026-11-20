//! Exact old assertions with phase labels, plus detached writer isolation.
//! Synthetic XML only. This source has not been compiled or executed.
const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const State = @import("../model/formatting_binding.zig").State;
const Service = @import("document_replace_all.zig").Service;

const title_source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle😀<p:titleMark ignore='false'/>needle</p:t></p:run></p:p></s:sec>";

test "document text title diagnostic same replacement right affinity remains four in the existing point splice oracle" {
    const Change = @import("../model/point_splice.zig").Change;
    const second = try Change.init(8, 6, 1);
    const first = try Change.init(0, 6, 1);
    const expected = try first.map(try second.map(8, .right), .right);
    try std.testing.expectEqual(@as(usize, 4), expected);
    var mapping = try @import("zero_width_coordinate_batch.zig").prepare(a, 14, &.{
        .{ .start = 0, .end = 6, .changed = true, .inserted_units = 1 },
        .{ .start = 8, .end = 14, .changed = true, .inserted_units = 1 },
    });
    defer mapping.deinit(a);
    try std.testing.expectEqual(expected, try mapping.map(8, .right));
    try std.testing.expectEqual(@as(u32, 3), try mapping.map(8, .left));
}

test "document text title diagnostic detached same replacement separates owned model from actual serializer output" {
    var tree = try @import("xml_part_tree.zig").parse(a, title_source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    const paragraph = &values.paragraphs[0];
    paragraph.title_positions = try @import("title_mark_current.zig").read(a, &tree, paragraph);
    try std.testing.expectEqual(@as(usize, 8), paragraph.title_positions.?[0].unit);
    var candidate = (try @import("title_mark_text_batch.zig").prepare(a, &tree, paragraph, &.{
        .{ .start = 0, .end = 6, .text = "한", .expected = "needle" },
        .{ .start = 8, .end = 14, .text = "한", .expected = "needle" },
    }, .{ .max_bytes = 1000, .max_spans = 1000 }, null)).?;
    defer candidate.deinit(a);
    const text = try @import("paragraph_text_snapshot.zig").copyCurrentText(a, &candidate, 1000);
    defer a.free(text);
    try std.testing.expectEqualStrings("한😀한", text);
    std.debug.print("TITLE_PHASE detached-current unit={d} expected=4\n", .{candidate.title_positions.?[0].unit});
    try std.testing.expectEqual(@as(usize, 4), candidate.title_positions.?[0].unit);
    var paragraphs = [_]@import("paragraph_structure_values.zig").Paragraph{candidate};
    const current: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &paragraphs };
    const xml = try @import("paragraph_structure_save.zig").write(a, &tree, &current, .{}, &.{}, 10000);
    defer a.free(xml);
    std.debug.print("TITLE_PHASE detached-xml {s}\n", .{xml});
    var reopened_tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer reopened_tree.deinit(a);
    var reopened_sites = try @import("text_sites.zig").collect(a, &reopened_tree, .{});
    defer reopened_sites.deinit(a);
    const reopened_locations = try @import("text_site_locations.zig").build(a, &reopened_tree, &reopened_sites, .{});
    defer a.free(reopened_locations);
    var reopened_report: @import("section_text.zig").Report = .{};
    var reopened_values = try @import("paragraph_structure_collect.zig").collect(a, &reopened_tree, &reopened_sites, reopened_locations, .{}, &reopened_report);
    defer reopened_values.deinit(a);
    const marks = try @import("title_mark_current.zig").read(a, &reopened_tree, &reopened_values.paragraphs[0]);
    defer a.free(marks);
    try std.testing.expectEqual(@as(usize, 1), marks.len);
    std.debug.print("TITLE_PHASE detached-reopened unit={d} expected=4\n", .{marks[0].unit});
    try std.testing.expectEqual(@as(usize, 4), marks[0].unit);
    try std.testing.expectEqualStrings(title_source, tree.source);
    try std.testing.expectEqual(@as(usize, 8), paragraph.title_positions.?[0].unit);
}

test "document text title diagnostic whole transaction preserves original assertions with phase labels" {
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
    std.debug.print("TITLE_PHASE current unit={d} expected=4 styles={} protected={}\n", .{ paragraph.title_positions.?[0].unit, paragraph.character_styles != null, paragraph.protected_positions != null });
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
    std.debug.print("TITLE_PHASE reopened unit={d} expected=4 saved_bytes={d}\n", .{ titles[0].unit, saved.len });
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
