//! Build one atomic text insertion and font-name application transaction.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const Language = @import("../model/character_fonts.zig").Language;

pub const Input = struct {
    section: usize,
    paragraph: usize,
    start: u32,
    end: u32,
    text: []const u8,
    language: Language,
    name: []const u8,
    text_kind: @import("text_transaction_commands.zig").Kind = .plain,
    begin_element: usize = 0,
};

fn Command(comptime format: Format) type {
    return @import("text_transaction_commands.zig").Command(format);
}

pub fn build(comptime format: Format, input: Input) ![2]Command(format) {
    if (format == .hwp5 and input.text_kind != .plain) return error.InvalidTextKind;
    try @import("../model/font_name.zig").validate(input.name, 4096);
    const inserted = try @import("text_transaction_commands.zig").build(format, .{ .section = input.section, .paragraph = input.paragraph, .start = input.start, .end = input.end, .text = input.text, .kind = input.text_kind, .begin_element = input.begin_element });
    const units = inserted.units;
    const end = inserted.end;
    return if (format == .hwp5) .{
        inserted.command,
        .{ .set_character_font_name = .{ .section = input.section, .paragraph = input.paragraph, .start_unit = input.start, .end_unit = end, .language = input.language, .name = input.name } },
    } else .{
        inserted.command,
        .{ .kind = .character_font_name, .section = input.section, .paragraph = input.paragraph, .start = input.start, .deleted = units, .inserted = "", .font_language = input.language, .font_name = input.name },
    };
}

test "named font text commands measure Unicode and reject invalid boundaries" {
    const base: Input = .{ .section = 0, .paragraph = 2, .start = 3, .end = 4, .text = "한😀", .language = .latin, .name = "New Font" };
    const hwp = try build(.hwp5, base);
    const hwpx = try build(.hwpx, base);
    var protected = base;
    protected.text_kind = .field;
    protected.begin_element = 32;
    const field = try build(.hwpx, protected);
    try std.testing.expectEqual(.field, field[0].kind);
    try std.testing.expectEqual(@as(usize, 32), field[0].begin_element);
    try std.testing.expectError(error.InvalidTextKind, build(.hwp5, protected));
    try std.testing.expectEqual(@as(u32, 6), hwp[1].set_character_font_name.end_unit);
    try std.testing.expectEqual(@as(u32, 3), hwpx[1].deleted);
    try std.testing.expectEqual(@as(u32, 1), hwpx[0].deleted);
    try std.testing.expectEqual(base.text.ptr, hwpx[0].inserted.ptr);
    try std.testing.expectEqual(base.name.ptr, hwp[1].set_character_font_name.name.ptr);
    var invalid = base;
    invalid.start = 5;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, invalid));
    invalid = base;
    invalid.text = "";
    try std.testing.expectError(error.InvalidTextPosition, build(.hwp5, invalid));
    invalid.text = "\xff";
    try std.testing.expectError(error.InvalidUtf8, build(.hwp5, invalid));
    invalid = base;
    invalid.start = std.math.maxInt(u32);
    invalid.end = invalid.start;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, invalid));
}

test "named font text transaction materializes empty HWPX with one undo" {
    const a = std.testing.allocator;
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'><h:refList><h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='0' face='Old'/></h:fontface></h:fontfaces><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'><h:fontRef hangul='0'/></h:charPr></h:charProperties></h:refList></h:head>";
    const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t/></p:run></p:p></s:sec>";
    const bytes = try @import("../hwpx/test_package_fixture.zig").syntheticStructureZip(a, header, section);
    defer a.free(bytes);
    var session = try @import("../hwpx/editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var history = try @import("../hwpx/editor_history.zig").History.init(&session, 4, 4_000_000);
    defer history.deinit();
    var commands = try build(.hwpx, .{ .section = 0, .paragraph = 1, .start = 0, .end = 0, .text = "한😀", .language = .hangul, .name = "Typing Font" });
    try std.testing.expect(try history.applyBatch(&session, &commands));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqual(@as(usize, 1), session.font_resources.entries.items.len);
    const spans = try @import("../hwpx/character_style_snapshot.zig").read(&session, 0, 1);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 3), spans[spans.len - 1].end_unit);
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    var checked = false;
    for (shapes) |shape| if (shape.id == spans[0].char_shape_id.?) {
        try std.testing.expectEqual(session.font_resources.entries.items[0].id, shape.font_ids.?[0].?);
        checked = true;
    };
    try std.testing.expect(checked);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.undo(&session));
    commands[1].paragraph = 999_999;
    try std.testing.expectError(error.InvalidParagraphIndex, history.applyBatch(&session, &commands));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "named font text transaction materializes empty HWP5 with one undo" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("../hwp5/edit/style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 4, .utf8 = "" } });
    const empty = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(empty.bytes);
    var history = try @import("../hwp5/edit/editor_history.zig").History.init(a, session, 4, 4_000_000);
    defer history.deinit();
    var commands = try build(.hwp5, .{ .section = 0, .paragraph = 5, .start = 0, .end = 0, .text = "한😀", .language = .hangul, .name = "Typing Font" });
    try std.testing.expect(try history.applyBatch(session, &commands));
    const ranges = try session.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const shapes = try session.characterShapes(a);
    defer a.free(shapes);
    const fontId = try session.ensureFont(.hangul, "Typing Font");
    try std.testing.expectEqual(@as(u16, @intCast(fontId)), shapes[ranges[0].char_shape_id.?].font_ids[0]);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    commands[1].set_character_font_name.paragraph = 999_999;
    try std.testing.expectError(error.InvalidParagraph, history.applyBatch(session, &commands));
    const original = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, empty.bytes, original.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
