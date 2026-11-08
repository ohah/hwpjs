//! Focused HWP5 initial-text contract; run only against the frozen candidate.
const std = @import("std");
const initial = @import("hwp5/edit/created_table_initial_text.zig");
const request = @import("wasm/hwp5_table_creation_request.zig");
const model = @import("model/created_table.zig");
const Session = @import("hwp5/edit/style_preservation.zig").Session;
const History = @import("hwp5/edit/editor_history.zig").History;
const a = std.testing.allocator;
const texts: initial.Grid = &.{ &.{ "항목😀<&", "누리" }, &.{ "", "마지막" } };
const value: request.Request = .{
    .version = 1,
    .section = 0,
    .paragraph = 1,
    .unit = 0,
    .rows = 2,
    .columns = 2,
    .width = 30000,
    .row_height = 8000,
    .resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 },
    .options = .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    },
    .cell_texts = texts,
};
fn table(allocator: std.mem.Allocator) !model.Table {
    return model.create(allocator, 11, 12, try @import("model/table_creation_plan.zig").create(2, 2, 30000, 8000, 4), &.{ 1, 2, 3, 4 }, value.resources, 4);
}
fn fillOwned(allocator: std.mem.Allocator) !void {
    var candidate = try table(allocator);
    defer candidate.deinit(allocator);
    try initial.populate(allocator, &candidate, texts, 1024);
    const expected = [_][]const u8{ texts[0][0], texts[0][1], texts[1][0], texts[1][1] };
    for (candidate.cells, expected) |cell, expected_text| try std.testing.expectEqualStrings(expected_text, cell.text);
    try std.testing.expect(candidate.cells[0].text.ptr != texts[0][0].ptr);
}

test "HWP5 initial text owns a fresh model and frees every failed allocation" {
    try fillOwned(a);
    try std.testing.checkAllAllocationFailures(a, fillOwned, .{});
}

test "HWP5 initial text rejects every C0 DEL invalid UTF8 and late ragged row before replacement" {
    var candidate = try table(a);
    defer candidate.deinit(a);
    inline for (.{ "\r", "\n", "\t", "\x00", "\x1f", "\x7f", "\xff", "\xc0\xaf", "\xed\xa0\x80" }) |bad| {
        try std.testing.expectError(error.InvalidTableCellText, initial.populate(a, &candidate, &.{ &.{ "valid", "" }, &.{ "", bad } }, 1024));
        for (candidate.cells) |cell| try std.testing.expectEqualStrings("", cell.text);
    }
    for (0..32) |code| {
        const bad = [_]u8{@intCast(code)};
        try std.testing.expectError(error.InvalidTableCellText, initial.validateTexts(1, 1, &.{&.{&bad}}, 1));
    }
    try std.testing.expectError(error.InvalidTableCellTexts, initial.populate(a, &candidate, &.{ &.{ "valid", "" }, &.{"last"} }, 1024));
    try std.testing.expectError(error.InvalidTableCellTexts, initial.validateTexts(1, 1, &.{}, 100));
    for (candidate.cells) |cell| try std.testing.expectEqualStrings("", cell.text);
}

test "HWP5 initial text bounds total UTF8 bytes and exact 4096 cell grid" {
    try initial.validateTexts(1, 2, &.{&.{ "😀", "" }}, 4);
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(1, 2, &.{&.{ "😀", "x" }}, 4));
    var cells: [4096][]const u8 = @splat("");
    try initial.validateTexts(1, 4096, &.{&cells}, 0);
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(1, 4097, &.{&cells}, 100));
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(0, 1, &.{}, 100));
    const huge = try a.alloc(u8, initial.max_request_bytes + 1);
    defer a.free(huge);
    @memset(huge, 'a');
    try initial.validateTexts(1, 1, &.{&.{huge[0..initial.max_request_bytes]}}, initial.max_request_bytes);
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(1, 1, &.{&.{huge}}, std.math.maxInt(usize)));
    try std.testing.expectError(error.LimitExceeded, request.parse(a, huge));
}

fn parseOwned(allocator: std.mem.Allocator, wire: []const u8) !void {
    const parsed = try request.parse(allocator, wire);
    defer parsed.deinit();
    try std.testing.expectEqualStrings(texts[0][0], parsed.value.cell_texts.?[0][0]);
    try std.testing.expect(parsed.value.cell_texts.?[0][0].ptr != texts[0][0].ptr);
}

test "HWP5 initial request rejects null duplicate unknown malformed grids and owns JSON" {
    const wire = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(wire);
    try std.testing.checkAllAllocationFailures(a, parseOwned, .{wire});
    for (0..wire.len) |n| try std.testing.expectError(error.InvalidTableCreationRequest, request.parse(a, wire[0..n]));
    inline for (.{ "\"unknown\":0,", "\"version\":1,", "\"cell_texts\":null," }) |extra| {
        const bad = try std.mem.concat(a, u8, &.{ "{", extra, wire[1..] });
        defer a.free(bad);
        try std.testing.expectError(error.InvalidTableCreationRequest, request.parse(a, bad));
    }
    var blank = value;
    blank.cell_texts = null;
    const null_wire = try std.json.Stringify.valueAlloc(a, blank, .{});
    defer a.free(null_wire);
    try std.testing.expectError(error.InvalidTableCreationRequest, request.parse(a, null_wire));
    const omit_wire = try std.json.Stringify.valueAlloc(a, blank, .{ .emit_null_optional_fields = false });
    defer a.free(omit_wire);
    const omitted = try request.parse(a, omit_wire);
    defer omitted.deinit();
    try std.testing.expect(omitted.value.cell_texts == null);
    inline for (.{ "[]", "[[]]", "[[1,2],[3,4]]", "[[[97],[98]],[[99],[100]]]", "[[\"a\",\"b\"],[\"c\"]]", "[[\"a\",\"b\"],[\"c\",\"\\n\"]]", "\"text\"" }) |grid| {
        const bad = try std.fmt.allocPrint(a, "{{\"cell_texts\":{s},{s}", .{ grid, omit_wire[1..] });
        defer a.free(bad);
        if (request.parse(a, bad)) |parsed| {
            parsed.deinit();
            return error.ExpectedRefusal;
        } else |err| try std.testing.expect(err != error.OutOfMemory);
    }
}

fn source() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
}
fn unchanged(session: *const Session, input: []const u8) !void {
    try std.testing.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}

test "HWP5 initial table prepares detached then one stage owns history undo redo and reopen" {
    const input = try source();
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 4, 16 * 1024 * 1024);
    defer history.deinit();
    const wire = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(wire);
    {
        var prepared = try request.prepare(a, session, wire);
        defer prepared.deinit(a);
        try unchanged(session, input);
        try std.testing.expectEqualStrings(texts[1][1], prepared.table.cells[3].text);
        try std.testing.expect(try history.apply(session, prepared.command()));
    }
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 1), try session.pendingTableCount(0));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const fresh = try Session.open(a, saved.bytes);
    defer fresh.close();
    const expected = [_][]const u8{ texts[0][0], texts[0][1], texts[1][0], texts[1][1] };
    for (expected, 0..) |cell, i| {
        const native = try fresh.copyText(a, 0, i + 2);
        defer a.free(native);
        const utf8 = try std.mem.concat(a, u8, &.{ cell, "\r" });
        defer a.free(utf8);
        const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, utf8);
        defer a.free(utf16);
        try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(utf16), native);
    }
    try std.testing.expect(try history.undo(session));
    try unchanged(session, input);
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

fn prepareOwned(allocator: std.mem.Allocator, session: *const Session, wire: []const u8) !void {
    var prepared = try request.prepare(allocator, session, wire);
    defer prepared.deinit(allocator);
    try std.testing.expectEqualStrings(texts[0][1], prepared.table.cells[1].text);
}

test "HWP5 initial request preparation all allocation failures leave original and pending untouched" {
    const input = try source();
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    const wire = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(wire);
    try std.testing.checkAllAllocationFailures(a, prepareOwned, .{ session, wire });
    try unchanged(session, input);
}

comptime {
    _ = @import("wasm/hwp5_table_creation_request_tests.zig");
}
