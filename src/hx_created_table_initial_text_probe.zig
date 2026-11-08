//! 초기 본문 표 준비와 기존 게시 경계의 집중 검사입니다.
const std = @import("std");
const initial = @import("hwpx/created_table_initial_text.zig");
const editor = @import("hwpx/editor_session.zig");
const history = @import("hwpx/editor_history.zig");
const texts: []const []const []const u8 = &.{ &.{ "첫째😀<&", "둘째" }, &.{ "", "마지막" } };

fn request(a: std.mem.Allocator, grid: []const []const []const u8) ![]u8 {
    return std.json.Stringify.valueAlloc(a, initial.Request{ .version = 1, .section = 0, .paragraph = 1, .unit = 0, .rows = 2, .columns = 2, .width = 20000, .row_height = 3000, .resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, .cell_texts = grid }, .{});
}

fn expectSourceUnchanged(session: *const editor.Session, source: []const u8) !void {
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    const saved = try session.save();
    defer session.allocator.free(saved);
    try std.testing.expectEqualSlices(u8, source, saved);
}

test "초기 셀 본문 엄격한 요청과 소유 문자열" {
    const a = std.testing.allocator;
    const wire = try request(a, texts);
    defer a.free(wire);
    const parsed = try initial.parse(a, wire);
    defer parsed.deinit();
    try std.testing.expectEqualStrings("첫째😀<&", parsed.value.cell_texts[0][0]);
    try std.testing.expectEqualStrings("", parsed.value.cell_texts[1][0]);
    try std.testing.expect(parsed.value.cell_texts[0][0].ptr != texts[0][0].ptr);
    try std.testing.expectError(error.InvalidTableCreationRequest, initial.parse(a, "{}"));
    try std.testing.expectError(error.InvalidTableCreationRequest, initial.parse(a, "{\"version\":1,\"version\":1}"));
    const with_unknown = try std.fmt.allocPrint(a, "{{\"unknown\":0,{s}", .{wire[1..]});
    defer a.free(with_unknown);
    try std.testing.expectError(error.InvalidTableCreationRequest, initial.parse(a, with_unknown));
}

test "초기 셀 본문 행열과 후행 잘못된 셀 거부" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidTableCellTexts, initial.validateTexts(2, 2, &.{&.{ "a", "b" }}, 100));
    try std.testing.expectError(error.InvalidTableCellTexts, initial.validateTexts(2, 2, &.{ &.{ "a", "b" }, &.{"c"} }, 100));
    const wire = try request(a, &.{ &.{ "a", "b" }, &.{ "c", "마지막\n줄" } });
    defer a.free(wire);
    try std.testing.expectError(error.InvalidTableCellText, initial.parse(a, wire));
}

test "초기 셀 본문 JSON은 숫자 바이트 배열과 null을 문자열로 바꾸지 않음" {
    const a = std.testing.allocator;
    const wire = try request(a, texts);
    defer a.free(wire);
    const start = std.mem.indexOf(u8, wire, "\"cell_texts\":") orelse return error.MissingTestField;
    inline for (.{ "null", "1", "\"text\"", "[\"ab\",\"cd\"]", "[[[97],[98]],[[99],[100]]]", "[[[],[]],[[],[]]]", "[[null,\"b\"],[\"c\",\"d\"]]" }) |grid| {
        const bad = try std.fmt.allocPrint(a, "{s}\"cell_texts\":{s}}}", .{ wire[0..start], grid });
        defer a.free(bad);
        try std.testing.expectError(error.InvalidTableCreationRequest, initial.parse(a, bad));
    }
}

test "초기 셀 본문 UTF8과 문단 제어 거부" {
    inline for (.{ "\r", "\n", "\x00", "\t", "\x7f", "\xff" }) |bad| {
        try std.testing.expectError(error.InvalidTableCellText, initial.validateTexts(1, 1, &.{&.{bad}}, 100));
    }
    try initial.validateTexts(1, 2, &.{&.{ "😀", "" }}, 4);
}

test "초기 셀 본문 총 바이트 예산과 실제 4096셀 경계" {
    try initial.validateTexts(1, 2, &.{&.{ "ab", "cd" }}, 4);
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(1, 2, &.{&.{ "ab", "cde" }}, 4));
    var cells: [4096][]const u8 = undefined;
    @memset(&cells, "");
    try initial.validateTexts(1, 4096, &.{&cells}, 0);
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(1, 4097, &.{&cells}, 100));
    try std.testing.expectError(error.LimitExceeded, initial.validateTexts(0, 1, &.{}, 100));
}

test "초기 셀 본문 분리 준비는 원본과 세션을 게시하지 않음" {
    const a = std.testing.allocator;
    const source = try @import("new_document/root.zig").hwpx(a);
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    const wire = try request(a, texts);
    defer a.free(wire);
    var prepared = try initial.prepare(&session, wire);
    defer prepared.deinit(a);
    try expectSourceUnchanged(&session, source);
    try std.testing.expectEqualStrings(texts[0][0], prepared.table.cells[0].text);
    try std.testing.expectEqualStrings(texts[1][1], prepared.table.cells[3].text);
    try std.testing.expectEqual(@as(usize, 4), prepared.table.cells.len);
    try std.testing.expect(prepared.command().created_table.? == &prepared.table);
}

test "초기 셀 본문 한 명령 게시 undo redo와 저장 재열기" {
    const a = std.testing.allocator;
    const source = try @import("new_document/root.zig").hwpx(a);
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    var h = try history.History.init(&session, 4, 16 * 1024 * 1024);
    defer h.deinit();
    const wire = try request(a, texts);
    defer a.free(wire);
    {
        var prepared = try initial.prepare(&session, wire);
        defer prepared.deinit(a);
        try std.testing.expect(try h.apply(&session, prepared.command()));
    }
    // 명령 버퍼를 해제한 뒤에도 이력은 소유 모델을 유지해야 합니다.
    try std.testing.expectEqualStrings(texts[0][0], session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try h.undo(&session));
    try expectSourceUnchanged(&session, source);
    try std.testing.expect(!try h.undo(&session));
    try std.testing.expect(try h.redo(&session));
    try std.testing.expectEqualStrings(texts[1][1], session.sections[0].created_tables.entries.items[0].table.cells[3].text);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const bindings = try @import("hwpx/table_display_bindings.zig").read(a, &reopened, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 4), bindings.len);
    const expected = [_][]const u8{ texts[0][0], texts[0][1], texts[1][0], texts[1][1] };
    for (bindings, expected) |binding, value| {
        const observed = try reopened.anchorText(0, binding.paragraph);
        defer a.free(observed);
        try std.testing.expectEqualStrings(value, observed);
    }
}

test "초기 셀 본문 잘못된 원본 위치와 자원은 원본 보존" {
    const a = std.testing.allocator;
    const source = try @import("new_document/root.zig").hwpx(a);
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    const wire = try request(a, texts);
    defer a.free(wire);
    const parsed = try initial.parse(a, wire);
    defer parsed.deinit();
    inline for (.{ "section", "paragraph", "unit" }) |field| {
        var bad = parsed.value;
        @field(bad, field) = std.math.maxInt(u32);
        const payload = try std.json.Stringify.valueAlloc(a, bad, .{});
        defer a.free(payload);
        if (initial.prepare(&session, payload)) |value| {
            var unexpected = value;
            unexpected.deinit(a);
            return error.ExpectedRefusal;
        } else |err| if (err == error.OutOfMemory) return err;
        try expectSourceUnchanged(&session, source);
    }
    var bad = parsed.value;
    bad.resources.character = std.math.maxInt(u32);
    const payload = try std.json.Stringify.valueAlloc(a, bad, .{});
    defer a.free(payload);
    try std.testing.expectError(error.InvalidCharacterShapeReference, initial.prepare(&session, payload));
    try expectSourceUnchanged(&session, source);
}

test "초기 셀 본문 XML은 기존 직렬화로 특수문자와 빈 셀 보존" {
    const a = std.testing.allocator;
    const source = try @import("new_document/root.zig").hwpx(a);
    defer a.free(source);
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    const wire = try request(a, texts);
    defer a.free(wire);
    var prepared = try initial.prepare(&session, wire);
    defer prepared.deinit(a);
    const xml = try @import("hwpx/created_table_xml.zig").write(a, &prepared.table, 100000);
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "첫째😀&lt;&amp;") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<hp:t></hp:t>") != null);
}

fn allocationCase(a: std.mem.Allocator, source: []const u8, wire: []const u8) !void {
    var session = try editor.open(a, source, .{});
    defer session.deinit();
    var prepared = try initial.prepare(&session, wire);
    defer prepared.deinit(a);
    try std.testing.expectEqualStrings(texts[0][0], prepared.table.cells[0].text);
    try expectSourceUnchanged(&session, source);
}

test "초기 셀 본문 준비 OOM은 소유 할당 누수와 게시 없음" {
    const a = std.testing.allocator;
    const source = try @import("new_document/root.zig").hwpx(a);
    defer a.free(source);
    const wire = try request(a, texts);
    defer a.free(wire);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ source, wire });
}
