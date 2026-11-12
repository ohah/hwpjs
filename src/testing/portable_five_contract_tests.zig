//! Authored portable contract lane. No external document or runtime file IO.
//! Original observed-document tests remain in their owning modules unchanged.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const chart_zip = @embedFile("fixtures/portable-five/chart.hwpx");
const background_zip = @embedFile("fixtures/portable-five/background.hwpx");
const runless_zip = @embedFile("fixtures/portable-five/runless.hwpx");
const h5_file = @embedFile("fixtures/portable-five/table-wire.hwp");
const gif = @embedFile("fixtures/portable-five/pixel.gif");
const archive = @import("../zip/archive.zig");
const editor = @import("../hwpx/editor_session.zig");
const spans = @import("../hwpx/character_style_snapshot.zig");
const failures = @import("allocation_failures.zig");
const limit = 4_000_000;

// ZIP payload decode is exercised in addition to the existing XML-only tests.
test "portable five chart blank owns explicit gap through authored ZIP" {
    var zip = try archive.open(a, chart_zip, .{});
    defer zip.deinit();
    const xml = try zip.decode(zip.find("Chart/chart1.xml").?, limit);
    defer a.free(xml);
    var tree = try @import("../hwpx/chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    const policy = @import("../hwpx/chart_blank_policy.zig");
    const result = (try policy.read(a, &tree, 4096)).?;
    try t.expectEqual(policy.Policy.gap, result.value.?);
    try t.expect(tree.elements[result.node].is(@import("../hwpx/chart_namespace.zig").uri, "dispBlanksAs"));
    try t.expectEqualStrings(@embedFile("fixtures/portable-five/chart.xml"), tree.source);
    try t.expectEqualSlices(u8, xml, tree.source);
    try t.expectError(error.LimitExceeded, zip.decode(zip.find("Chart/chart1.xml").?, xml.len - 1));
    try failures.check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("../hwpx/chart_tree.zig").Tree) !void {
            try t.expectEqual(policy.Policy.gap, (try policy.read(allocator, source, 4096)).?.value.?);
        }
    }.run, .{&tree});
}

test "portable five chart host reads exact authored dimensions instead of OLE fallback" {
    var zip = try archive.open(a, chart_zip, .{});
    defer zip.deinit();
    const xml = try zip.decode(zip.find("Contents/section0.xml").?, limit);
    defer a.free(xml);
    var tree = try @import("../hwpx/section_tree.zig").parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("../hwpx/document_xml.zig").paragraph_uri, "switch")) continue;
        const value = try @import("../hwpx/chart_host_geometry.zig").read(a, &tree, node);
        count += 1;
        // These are author_fixtures.py declarations, never observed-document defaults.
        try t.expectEqual(@as(?u32, 12345), value.geometry.width);
        try t.expectEqual(@as(?u32, 23456), value.geometry.height);
        try t.expectEqual(@as(?u32, 4), value.geometry.width_relative);
        try t.expectEqual(@as(?u32, 2), value.geometry.height_relative);
        try t.expectEqual(@as(?bool, false), value.geometry.treat_as_character);
        try t.expectEqual(@as(?i64, -17), value.geometry.vertical_offset);
        try t.expectEqual(@as(?i64, 29), value.geometry.horizontal_offset);
        try t.expectEqualDeep([4]?u32{ 2, 2, 0, 0 }, value.position.relations);
        try t.expectError(error.InvalidChartPair, @import("../hwpx/chart_host_geometry.zig").read(a, &tree, value.chart_node));
    }
    try t.expectEqual(@as(usize, 1), count);
    try t.expectEqualStrings(@embedFile("fixtures/portable-five/chart-section.xml"), tree.source);
    try t.expectEqualSlices(u8, xml, tree.source);
}

test "portable five background GIF source survives Session close with exact bytes hash and limits" {
    const source = @import("../hwpx/table_background_source_bytes.zig");
    const owned = block: {
        var session = try editor.open(a, background_zip, .{});
        defer session.deinit();
        var report = try @import("../hwpx/table_border_sources.zig").read(a, &session, 0);
        defer report.deinit(a);
        try t.expectEqual(@as(usize, 2), report.cells.len);
        var selected: ?usize = null;
        var unstyled: ?usize = null;
        for (report.cells) |cell| {
            if (cell.style_index) |index| {
                try t.expectEqual(@as(u32, 17), report.styles[index].id);
                try t.expect(selected == null);
                selected = cell.list_node;
            } else unstyled = cell.list_node;
        }
        const list = selected orelse return error.MissingAuthoredBackgroundCell;
        try t.expect(unstyled != null);
        try t.expectError(error.MissingTableBackgroundStyle, source.read(a, &session, 0, unstyled.?, gif.len));
        try t.expectError(error.InvalidSectionIndex, source.read(a, &session, session.sections.len, list, gif.len));
        try t.expectError(error.LimitExceeded, source.read(a, &session, 0, list, gif.len - 1));
        const result = try source.read(a, &session, 0, list, gif.len);
        errdefer a.free(result);
        // A separate read must own a different buffer, with unchanged payload.
        const second = try source.read(a, &session, 0, list, gif.len);
        defer a.free(second);
        try t.expect(result.ptr != second.ptr);
        try t.expectEqualSlices(u8, gif, second);
        const saved = try session.save();
        defer a.free(saved);
        try t.expectEqualSlices(u8, background_zip, saved);
        break :block result;
    };
    defer a.free(owned);
    try t.expectEqual(@as(usize, 35), owned.len);
    try t.expectEqualSlices(u8, gif, owned);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(owned, &digest, .{});
    // Independent stdlib hashlib digest of the authored 1x1 GIF, not the corpus GIF.
    const hex = std.fmt.bytesToHex(digest, .lower);
    try t.expectEqualStrings("cd251e1117213163d1cda55ad6f7ec3e6046042739c67efe0c939f6bded51efe", &hex);
}

fn expectAnchor(session: *const editor.Session, paragraph: usize, expected: []const u8) !void {
    const text = try session.anchorText(0, paragraph);
    defer a.free(text);
    try t.expectEqualStrings(expected, text);
}

test "portable five runless Session observes explicit sparse style through UTF16 save checkpoint reopen" {
    var session = try editor.open(a, runless_zip, .{});
    defer session.deinit();
    var before = try @import("../hwpx/editor_checkpoint.zig").capture(&session, limit);
    defer before.deinit();
    // Section0's second p has no run; style17 explicitly owns charPr43.
    const paragraph = 2;
    try t.expect(try session.canEdit(0, paragraph));
    try expectAnchor(&session, paragraph, "");
    const initial_ranges = try spans.read(&session, 0, paragraph);
    defer a.free(initial_ranges);
    try t.expectEqual(@as(usize, 1), initial_ranges.len);
    try t.expectEqual(@as(?u32, 43), initial_ranges[0].char_shape_id);
    try t.expectEqual(@as(usize, 0), initial_ranges[0].end_unit);
    try t.expectError(error.InvalidTextPosition, session.splice(0, paragraph, 1, 0, "bad"));
    try t.expect(try session.splice(0, paragraph, 0, 0, "본문😀<&"));
    try t.expectError(error.SplitSurrogatePair, session.splice(0, paragraph, 3, 0, "bad"));
    try t.expect(!try session.splice(0, paragraph, 0, 2, "본문"));
    try expectAnchor(&session, paragraph, "본문😀<&");
    const current_ranges = try spans.read(&session, 0, paragraph);
    defer a.free(current_ranges);
    try t.expectEqual(@as(usize, 1), current_ranges.len);
    try t.expectEqual(@as(?u32, 43), current_ranges[0].char_shape_id);
    try t.expectEqual(@as(usize, 6), current_ranges[0].end_unit);
    try failures.check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var view = original.*;
            view.allocator = allocator;
            const ranges = try spans.read(&view, 0, paragraph);
            defer allocator.free(ranges);
            try t.expectEqual(@as(usize, 1), ranges.len);
            try t.expectEqual(@as(usize, 6), ranges[0].end_unit);
            try t.expectEqual(@as(?u32, 43), ranges[0].char_shape_id);
        }
    }.run, .{&session});
    try t.expect(try session.splice(0, paragraph, 0, 0, "추가"));
    try t.expect(try session.setCharacterProperties(0, paragraph, 0, 2, .{ .size = 1200 }));
    try t.expect(try session.splice(0, paragraph, 0, 0, "더"));
    const styled = try spans.read(&session, 0, paragraph);
    defer a.free(styled);
    try t.expectEqual(@as(usize, 2), styled.len);
    try t.expectEqual(@as(usize, 3), styled[0].end_unit);
    try t.expectEqual(@as(?u32, 43), styled[1].char_shape_id);
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    var found_size = false;
    for (shapes) |shape| if (shape.id == styled[0].char_shape_id) {
        try t.expectEqual(@as(?i32, 1200), shape.height);
        found_size = true;
    };
    try t.expect(found_size);
    try expectAnchor(&session, 1, "before");
    try expectAnchor(&session, 3, "after");
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try expectAnchor(&reopened, paragraph, "더추가본문😀<&");
    const reopened_ranges = try spans.read(&reopened, 0, paragraph);
    defer a.free(reopened_ranges);
    try t.expectEqualDeep(styled, reopened_ranges);
    try before.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, runless_zip, undone);
    try before.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expectEqualSlices(u8, runless_zip, session.source);
}

const wire = @import("../wasm/hwp5_table_creation_request.zig");
const h5 = @import("../hwp5/edit/style_preservation.zig");
const table_request: wire.Request = .{
    .version = 1,
    .section = 0,
    .paragraph = 1,
    .unit = 0,
    .rows = 1,
    .columns = 2,
    .width = 21600,
    .row_height = 3600,
    .resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 },
    .options = .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표😀" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    },
};

fn prepareOwned(allocator: std.mem.Allocator, session: *const h5.Session, bytes: []const u8) !void {
    var prepared = try wire.prepare(allocator, session, bytes);
    defer prepared.deinit(allocator);
    try t.expectEqual(@as(usize, 2), prepared.table.cells.len);
}

test "portable five H5 table wire prepares owned CFB commits saves reopens and restores history" {
    const session = try h5.Session.open(a, h5_file);
    defer session.close();
    const count = try session.paragraphCount(0);
    try t.expectEqual(@as(usize, 2), count);
    // Optional one-based border0 is explicitly absent; no border declaration in this input.
    const bytes = try std.json.Stringify.valueAlloc(a, table_request, .{ .emit_null_optional_fields = false });
    defer a.free(bytes);
    try failures.check(prepareOwned, .{ session, bytes });
    try t.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try t.expectEqualSlices(u8, h5_file, unchanged.bytes);
    var history = try @import("../hwp5/edit/editor_history.zig").History.init(a, session, 4, limit);
    defer history.deinit();
    {
        var prepared = try wire.prepare(a, session, bytes);
        defer prepared.deinit(a);
        try t.expect(try history.apply(session, prepared.command()));
    }
    try t.expectEqual(@as(usize, 1), try session.pendingTableCount(0));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try h5.Session.open(a, saved.bytes);
    defer reopened.close();
    try t.expectEqual(count + 2, try reopened.paragraphCount(0));
    const Source = @import("../hwp5/text_source.zig").Source;
    var original_source = try Source.open(a, h5_file);
    defer original_source.deinit();
    var saved_source = try Source.open(a, saved.bytes);
    defer saved_source.deinit();
    const info_before = try original_source.decodeDocInfo(a, limit);
    defer a.free(info_before);
    const info_after = try saved_source.decodeDocInfo(a, limit);
    defer a.free(info_after);
    try std.testing.expectEqualSlices(u8, info_before, info_after);
    try std.testing.expectEqualSlices(u8, &original_source.header.raw, &saved_source.header.raw);
    const raw = try saved_source.decodeSection(a, 0);
    defer a.free(raw);
    var records = @import("../hwp5/record.zig").Iterator.init(raw, .{});
    var tables: usize = 0;
    while (try records.next()) |record| if (record.tag == 77) {
        tables += 1;
        try t.expectEqual(@as(u16, 1), std.mem.readInt(u16, record.payload[4..6], .little));
        try t.expectEqual(@as(u16, 2), std.mem.readInt(u16, record.payload[6..8], .little));
    };
    try t.expectEqual(@as(usize, 1), tables);
    try t.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, h5_file, undone.bytes);
    try t.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
