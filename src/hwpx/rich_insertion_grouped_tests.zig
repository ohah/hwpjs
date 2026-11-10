//! Counters are populated only by the Native test build.
const Work = @import("rich_insertion_ranges.zig").Work;
var capture: ?*Work = null;
pub fn record(work: Work) void {
    if (capture) |output| output.* = work;
}

const std = @import("std");
const a = std.testing.allocator;
const f = @import("../model/formatting_patch.zig");
const model = @import("../model/text_transaction.zig");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const fixture = @import("test_formula_fixture.zig");

test "HX H01 grouped work N32 N64 N128 styles resources save reopen undo redo" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var seed_session = try editor.open(a, seed, .{});
    defer seed_session.deinit();
    for ([_]usize{ 32, 64, 128 }) |n| try scalingCase(seed_session.original_header.?.source, n);
}

fn scalingCase(header: []const u8, n: usize) !void {
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10' paraPrIDRef='0' styleIDRef='0'>");
    for (0..n) |_| try xml.appendSlice(a, "<p:run charPrIDRef='0' keep='opaque'><p:t>Ab</p:t></p:run>");
    try xml.appendSlice(a, "</p:p></s:sec>");
    const before = try fixture.zipWithSectionHeader(a, xml.items, header);
    defer a.free(before);
    var session = try editor.open(a, before, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try history_mod.History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: @import("text_transaction.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    const id = try lifetime.session(a);
    defer a.free(id);
    const owner: f.Owner = .{ .section = 0, .paragraph = 1 };
    var snapshot = try service.query(a, .{ .session = id, .revision = 0 }, &.{owner});
    defer snapshot.deinit();
    const edits = try a.alloc(model.edits.Edit, n);
    defer a.free(edits);
    for (edits, 0..) |*edit, index| {
        edit.* = .{ .start = @intCast(index * 2), .end = @intCast(index * 2 + 1), .text = "😀", .expected = "A" };
    }
    var patch: f.Patch = .{ .character = .{ .bold = true, .text_color = 0x123456, .underline_kind = .bottom, .underline_color = 0x224466, .strike_enabled = true, .underline_style = .DASH, .strike_style = .SOLID, .strike_color = 0x654321 } };
    for ([_][]const u8{ "Grouped Hangul", "Grouped Latin", "Grouped Hanja", "Grouped Japanese", "Grouped Other", "Grouped Symbol", "Grouped User" }, 0..) |name, index| patch.fonts[index] = .{ .name = name };
    const group: model.Group = .{ .ref = snapshot.rows[0].ref, .before_units = snapshot.rows[0].before_units, .edits = edits, .insertion = patch };
    var work: Work = .{};
    capture = &work;
    defer capture = null;
    try std.testing.expect(try service.apply(a, .{ .binding = snapshot.binding, .scope = .selection, .coverage = null, .groups = &.{group} }));
    try std.testing.expectEqualDeep(Work{ .spans = n, .ranges = n, .scalars = 2 * n, .fragments = 2 * n, .resource_steps = 8, .paint_steps = 8 * n, .font_ensures = 7 }, work);
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try std.testing.expectEqual(@as(usize, 8), session.character_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 7), session.font_resources.entries.items.len);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqual(n * 2, std.mem.count(u8, after, "keep='opaque'"));
    var reopened = try editor.open(a, after, .{});
    defer reopened.deinit();
    const spans = try @import("character_style_snapshot.zig").read(&reopened, 0, 1);
    defer a.free(spans);
    try std.testing.expectEqual(n * 2, spans.len);
    const rich_id = spans[0].char_shape_id.?;
    try std.testing.expect(rich_id != 0);
    for (0..n) |i| {
        try std.testing.expectEqual(@as(usize, i * 3), spans[i * 2].start_unit);
        try std.testing.expectEqual(@as(usize, i * 3 + 2), spans[i * 2].end_unit);
        try std.testing.expectEqual(@as(?u32, rich_id), spans[i * 2].char_shape_id);
        try std.testing.expectEqual(@as(?u32, 0), spans[i * 2 + 1].char_shape_id);
    }
    const text = try reopened.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqual(n * "😀b".len, text.len);
    for (0..n) |i| try std.testing.expectEqualStrings("😀b", text[i * "😀b".len ..][0.."😀b".len]);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    std.debug.print("HX_GROUPED N={d} spans={d} ranges={d} scalars={d} fragments={d} resource_steps={d} paint_steps={d} font_ensures={d}\n", .{ n, work.spans, work.ranges, work.scalars, work.fragments, work.resource_steps, work.paint_steps, work.font_ensures });
}

test "HX H01 grouped multi-source range matches legacy resource order and saved bytes" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var seed_session = try editor.open(a, seed, .{});
    defer seed_session.deinit();
    const fixture_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0' keep='opaque'><p:t>A😀BC</p:t></p:run></p:p></s:sec>";
    const fixture_bytes = try fixture.zipWithSectionHeader(a, fixture_xml, seed_session.original_header.?.source);
    defer a.free(fixture_bytes);
    var styled = try editor.open(a, fixture_bytes, .{});
    defer styled.deinit();
    try std.testing.expect(try styled.setCharacterProperties(0, 1, 1, 4, .{ .italic = true, .size = 2300 }));
    const before = try styled.save();
    defer a.free(before);
    const legacy = try mixed(before, true);
    defer a.free(legacy);
    const grouped = try mixed(before, false);
    defer a.free(grouped);
    try std.testing.expectEqualSlices(u8, legacy, grouped);
}

fn mixed(before: []const u8, legacy: bool) ![]u8 {
    var session = try editor.open(a, before, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try history_mod.History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    const edits = [_]model.edits.Edit{
        .{ .start = 0, .end = 3, .text = "A😀", .expected = "A😀" },
        .{ .start = 4, .end = 5, .text = "NEW😀", .expected = "C" },
    };
    const owner: f.Owner = .{ .section = 0, .paragraph = 1 };
    const char: @import("../model/document.zig").CharacterPropertyPatch = .{ .bold = true, .text_color = 0x123456 };
    const name = "Mixed Hangul";
    var patch: f.Patch = .{ .character = char };
    patch.fonts[0] = .{ .name = name };
    if (legacy) {
        var batch: @import("formatting_batch_context.zig").Context = .{};
        try session.beginFormattingBatch(&batch);
        defer session.endFormattingBatch(&batch);
        try std.testing.expect(try history.applyBatch(&session, &.{
            .{ .kind = .independent_text, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .independent_text_edits = &edits },
            .{ .kind = .character_properties, .paragraph = 1, .start = 0, .deleted = 3, .inserted = "", .character_properties = char },
            .{ .kind = .character_font_name, .paragraph = 1, .start = 0, .deleted = 3, .inserted = "", .font_name = name },
            .{ .kind = .character_properties, .paragraph = 1, .start = 4, .deleted = 5, .inserted = "", .character_properties = char },
            .{ .kind = .character_font_name, .paragraph = 1, .start = 4, .deleted = 5, .inserted = "", .font_name = name },
        }));
    } else {
        var lifetime: @import("../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const service: @import("text_transaction.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
        const id = try lifetime.session(a);
        defer a.free(id);
        var snapshot = try service.query(a, .{ .session = id, .revision = 0 }, &.{owner});
        defer snapshot.deinit();
        const group: model.Group = .{ .ref = snapshot.rows[0].ref, .before_units = 5, .edits = &edits, .insertion = patch };
        var missing = group;
        missing.insertion = .{ .character = .{ .strike_enabled = true, .strike_style = .DASH } };
        try std.testing.expectError(error.MissingCharacterDecoration, service.apply(a, .{ .binding = snapshot.binding, .scope = .selection, .coverage = null, .groups = &.{missing} }));
        const rejected = try session.save();
        defer a.free(rejected);
        try std.testing.expectEqualSlices(u8, before, rejected);
        try std.testing.expect(try service.apply(a, .{ .binding = snapshot.binding, .scope = .selection, .coverage = null, .groups = &.{group} }));
    }
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const after = try session.save();
    errdefer a.free(after);
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, before, restored);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    return after;
}

test "HX H01 grouped keeps legacy intermediate span budget when final spans fit" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var seed_session = try editor.open(a, seed, .{});
    defer seed_session.deinit();
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>abcdef</p:t></p:run></p:p></s:sec>";
    const bytes = try fixture.zipWithSectionHeader(a, xml, seed_session.original_header.?.source);
    defer a.free(bytes);
    const legacy = try budgetCase(bytes, true);
    defer a.free(legacy);
    const grouped = try budgetCase(bytes, false);
    defer a.free(grouped);
    try std.testing.expectEqualSlices(u8, legacy, grouped);
}

fn budgetCase(bytes: []const u8, legacy: bool) ![]u8 {
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(try session.setCharacterProperties(0, 1, 3, 4, .{ .bold = true }));
    try std.testing.expect(try session.setCharacterProperties(0, 1, 5, 6, .{ .bold = true }));
    const before = try session.save();
    defer a.free(before);
    session.history_delta_managed = true;
    var history = try history_mod.History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: @import("text_transaction.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    const id = try lifetime.session(a);
    defer a.free(id);
    var snapshot = try service.query(a, .{ .session = id, .revision = 0 }, &.{.{ .section = 0, .paragraph = 1 }});
    defer snapshot.deinit();
    const edits = [_]model.edits.Edit{
        .{ .start = 0, .end = 1, .text = "a", .expected = "a" },
        .{ .start = 4, .end = 5, .text = "e", .expected = "e" },
    };
    const group: model.Group = .{ .ref = snapshot.rows[0].ref, .before_units = 6, .edits = &edits, .insertion = .{ .character = .{ .bold = true } } };
    const request: model.Apply = .{ .binding = snapshot.binding, .scope = .selection, .coverage = null, .groups = &.{group} };
    const commands = [_]history_mod.Command{
        .{ .kind = .independent_text, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .independent_text_edits = &edits },
        .{ .kind = .character_properties, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true } },
        .{ .kind = .character_properties, .paragraph = 1, .start = 4, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true } },
    };
    for ([_]usize{ 4, 5 }) |limit| {
        session.options.max_sites = limit;
        const result = if (legacy) applyLegacy(&history, &session, &commands) else service.apply(a, request);
        if (limit == 4) {
            try std.testing.expectError(error.LimitExceeded, result);
            try std.testing.expectEqual(@as(u32, 0), history.revision());
            const rejected = try session.save();
            defer a.free(rejected);
            try std.testing.expectEqualSlices(u8, before, rejected);
        } else {
            try std.testing.expect(try result);
        }
    }
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try std.testing.expectEqual(@as(usize, 3), session.sections[0].structure_values.?.paragraphs[0].character_styles.?.len);
    return session.save();
}

fn applyLegacy(history: *history_mod.History, session: *editor.Session, commands: []const history_mod.Command) !bool {
    var batch: @import("formatting_batch_context.zig").Context = .{};
    try session.beginFormattingBatch(&batch);
    defer session.endFormattingBatch(&batch);
    return history.applyBatch(session, commands);
}
