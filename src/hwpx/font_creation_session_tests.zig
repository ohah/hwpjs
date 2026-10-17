const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX named font missing required container preserves source and history" {
    const a = std.testing.allocator;
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'><h:refList><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'><h:fontRef hangul='0'/></h:charPr></h:charProperties></h:refList></h:head>";
    const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t>AB</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_package_fixture.zig").syntheticStructureZip(a, header, section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 4, 4_000_000);
    defer history.deinit();
    try std.testing.expectError(error.MissingFontfaces, history.apply(&session, .{
        .kind = .character_font_name,
        .paragraph = 1,
        .start = 0,
        .deleted = 1,
        .inserted = "",
        .font_name = "Rejected Font",
    }));
    try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "HWPX named font batch uses one resource one history entry and atomic rejection" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const histories = @import("editor_history.zig");
    var history = try histories.History.init(&session, 4, 4_000_000);
    defer history.deinit();
    var commands = [_]histories.Command{
        .{ .kind = .character_font_name, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .font_name = "Batch Named Font" },
        .{ .kind = .character_font_name, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .font_name = "Batch Named Font" },
    };
    try std.testing.expect(try history.applyBatch(&session, &commands));
    try std.testing.expectEqual(@as(usize, 1), session.font_resources.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.undo(&session));
    commands[0].font_name = "Rejected Batch Font";
    commands[1].font_name = "Rejected Batch Font";
    commands[1].paragraph = 999_999;
    try std.testing.expectError(error.InvalidParagraphIndex, history.applyBatch(&session, &commands));
    try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

fn namedFontFailureSweep(a: std.mem.Allocator, with_history: bool) !void {
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'><h:refList><h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='0' face='Original'/></h:fontface></h:fontfaces><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'><h:fontRef hangul='0'/></h:charPr></h:charProperties></h:refList></h:head>";
    const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t>AB</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_package_fixture.zig").syntheticStructureZip(a, header, section);
    defer a.free(input);
    for (0..50_000) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        var session = try editor.open(failing.allocator(), input, .{});
        defer session.deinit();
        var history = try @import("editor_history.zig").History.init(&session, 4, 4_000_000);
        defer history.deinit();
        failing.fail_index = failing.alloc_index + index;
        const result = if (with_history) history.apply(&session, .{
            .kind = .character_font_name,
            .section = 0,
            .paragraph = 1,
            .start = 0,
            .deleted = 1,
            .inserted = "",
            .font_language = .hangul,
            .font_name = "Failure Font",
        }) else session.setCharacterFontName(0, 1, 0, 1, .hangul, "Failure Font");
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            const saved = try session.save();
            defer session.allocator.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            std.debug.print("HWPX named font rejected allocation points (history={any}): {d}\n", .{ with_history, index });
            return;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
            try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
            try std.testing.expect(!try history.undo(&session));
            try std.testing.expect(!try history.redo(&session));
            const saved = try session.save();
            defer session.allocator.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}

test "HWPX named font allocation failures leave original ZIP and no resources" {
    try @import("../testing/checked_allocator.zig").run(namedFontFailureSweep, .{false});
}

test "HWPX named font history allocation failures leave original ZIP and no entries" {
    try @import("../testing/checked_allocator.zig").run(namedFontFailureSweep, .{true});
}

test "HWPX named font history budget rejection rolls back resources and text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const budget = try @import("editor_checkpoint.zig").size(&session, std.math.maxInt(usize));
    var history = try @import("editor_history.zig").History.init(&session, 4, budget);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, .{
        .kind = .character_font_name,
        .section = 0,
        .paragraph = 2,
        .start = 0,
        .deleted = 1,
        .inserted = "",
        .font_language = .hangul,
        .font_name = "Budget Rejected Font",
    }));
    try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "HWPX new font intent saves ZIP reopens and checkpoint restores original" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer checkpoint.deinit();
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var inventory = try document.inspectFontReferences(a, .{});
    defer inventory.deinit(a);
    const ids = inventory.faces.table(.hangul).ids.items;
    var id: u32 = 0;
    for (ids) |existing| id = @max(id, std.math.add(u32, existing, 1) catch return error.InvalidFontId);
    try std.testing.expectEqual(id, try @import("font_creation.zig").ensure(&session, .hangul, "Hwpjs Session Font"));
    try std.testing.expectEqual(id, try @import("font_creation.zig").ensure(&session, .hangul, "Hwpjs Session Font"));
    try std.testing.expectError(error.InvalidFontName, @import("font_creation.zig").ensure(&session, .hangul, ""));
    const current = try @import("font_creation.zig").list(&session);
    defer @import("font_face_snapshot.zig").deinit(a, current);
    try std.testing.expectEqualStrings("Hwpjs Session Font", current[ids.len].name.?);
    try std.testing.expect(try session.setCharacterFontName(0, 2, 0, 1, .hangul, "Hwpjs Session Font"));
    try std.testing.expect(!try session.setCharacterFontName(0, 2, 0, 1, .hangul, "Hwpjs Session Font"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.InvalidTextPosition, session.setCharacterFontName(0, 2, 1, 0, .latin, "Rejected Font"));
    const rejected = try session.save();
    defer a.free(rejected);
    try std.testing.expectEqualSlices(u8, saved, rejected);
    var opened = try @import("package.zig").inspectDocument(a, saved, .{});
    defer opened.deinit(a);
    var tree = try opened.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var found = false;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "font")) continue;
        var face = try @import("font_face_values.zig").read(a, &tree, node, 4096);
        defer face.deinit(a);
        if (face.language == .hangul and face.id == id) {
            try std.testing.expectEqualStrings("Hwpjs Session Font", face.name.?);
            found = true;
        }
    }
    try std.testing.expect(found);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const ranges = try @import("character_style_snapshot.zig").read(&reopened, 0, 2);
    defer a.free(ranges);
    const shapes = try @import("character_style_resources.zig").displayShapes(&reopened);
    defer a.free(shapes);
    const shape_id = ranges[0].char_shape_id.?;
    const applied = for (shapes) |shape| {
        if (shape.id == shape_id) break shape.font_ids.?[0];
    } else return error.MissingCharacterShape;
    try std.testing.expectEqual(@as(?u32, id), applied);
    try checkpoint.exchange(&session);
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try checkpoint.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
