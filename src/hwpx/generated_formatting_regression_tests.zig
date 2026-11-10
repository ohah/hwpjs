//! Self-contained generated-paragraph formatting and writer regressions.
const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const new_document = @import("../new_document/root.zig");

fn regressionPrepare(session: *editor.Session) !void {
    try std.testing.expect(try session.splice(0, 1, 0, 0, "HEADER"));
    try std.testing.expect(try session.splitParagraph(0, 1, 6, 0));
    try std.testing.expect(try session.splice(0, 2, 0, 0, "BODY"));
    try std.testing.expect(try session.splitParagraph(0, 2, 4, 0));
    try std.testing.expect(try session.splice(0, 3, 0, 0, "TARGET😀"));
}

test "HWPX generated formatting regression direct bold before first reopen" {
    const a = std.testing.allocator;
    const input = try new_document.hwpx(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try regressionPrepare(&session);
    try std.testing.expect(try session.setCharacterProperties(0, 3, 0, 8, .{ .bold = true }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 3, 0, 8, .{ .bold = true }));
}

const regression_styles = @import("character_style_snapshot.zig");
const regression_resources = @import("character_style_resources.zig");
const regression_xml = @import("document_xml.zig");

fn regressionShapeAt(session: *const editor.Session, paragraph: usize, unit: usize) !@import("character_shape_display.zig").Shape {
    const spans = try regression_styles.read(session, 0, paragraph);
    defer session.allocator.free(spans);
    const shapes = try regression_resources.displayShapes(session);
    defer session.allocator.free(shapes);
    for (spans) |span| if (span.start_unit <= unit and unit < span.end_unit) {
        for (shapes) |shape| if (shape.id == span.char_shape_id) return shape;
        return error.MissingRegressionShape;
    };
    return error.MissingRegressionSpan;
}

fn regressionMetadata(original: *const editor.Session, current: *const editor.Session) !void {
    const old = &original.sections[0].tree;
    const tree = &current.sections[0].tree;
    // Preserve the authored XML values verbatim, including original page sizes.
    // Assert count and parent ownership separately so copying the controls into
    // every generated sibling cannot pass a mere substring-presence check.
    for ([_][]const u8{ "secPr", "ctrl", "colPr" }) |local| {
        var old_count: usize = 0;
        var count: usize = 0;
        for (old.elements, 0..) |element, index| if (element.is(regression_xml.paragraph_uri, local)) {
            old_count += 1;
            var found = false;
            for (tree.elements, 0..) |candidate, at| if (candidate.is(regression_xml.paragraph_uri, local) and std.mem.eql(u8, old.sourceOf(index), tree.sourceOf(at))) {
                found = true;
                var owner = candidate.parent;
                while (owner) |parent| {
                    if (tree.elements[parent].is(regression_xml.paragraph_uri, "p")) {
                        // Metadata must remain under the first body paragraph.
                        var previous: usize = 0;
                        for (tree.elements[0..parent]) |preceding| if (preceding.is(regression_xml.paragraph_uri, "p")) {
                            previous += 1;
                        };
                        try std.testing.expectEqual(@as(usize, 0), previous);
                        break;
                    }
                    owner = tree.elements[parent].parent;
                }
            };
            try std.testing.expect(found);
        };
        for (tree.elements) |element| if (element.is(regression_xml.paragraph_uri, local)) {
            count += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), old_count);
        try std.testing.expectEqual(old_count, count);
    }
}

fn regressionRoundtrip(session: *editor.Session, original: *const editor.Session) !void {
    const a = session.allocator;
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try regressionMetadata(original, &reopened);
    const again = try reopened.save();
    defer a.free(again);
    try std.testing.expectEqualSlices(u8, saved, again);
}

test "HWPX generated formatting regression direct italic size alignment and original metadata" {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try regressionPrepare(&session);
    try std.testing.expect(try session.setCharacterProperties(0, 3, 0, 8, .{ .italic = true }));
    try std.testing.expect(try session.setCharacterProperties(0, 3, 0, 8, .{ .size = 1800 }));
    try std.testing.expect(try session.setParagraphAlignment(0, 3, .CENTER));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const shape = try regressionShapeAt(&reopened, 3, 6);
    try std.testing.expect(shape.italic);
    try std.testing.expectEqual(@as(?i32, 1800), shape.height);
    const shapes = try reopened.paragraphShapes();
    defer {
        for (shapes) |*value| value.deinit(a);
        a.free(shapes);
    }
    const id = try reopened.paragraphShapeId(0, 3);
    var centered = false;
    for (shapes) |value| if (value.id == id) {
        centered = std.mem.eql(u8, value.horizontal orelse "", "CENTER");
    };
    try std.testing.expect(centered);
    try regressionMetadata(&original, &reopened);
}

test "HWPX generated formatting regression raw format writer same and different source templates" {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    // Saving then opening supplies distinct paragraph templates without changing
    // the authored new-document XML or introducing external fixtures.
    for ([_]bool{ false, true }) |different_templates| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        try regressionPrepare(&session);
        if (different_templates) {
            const intermediate = try session.save();
            defer a.free(intermediate);
            var replacement = try editor.open(a, intermediate, .{});
            session.deinit();
            session = replacement;
            replacement = undefined;
            try std.testing.expect(try session.splitParagraph(0, 3, 6, 0));
        }
        const paragraphs = session.sections[0].structure_values.?.paragraphs;
        if (different_templates) {
            try std.testing.expect(paragraphs[0].template_element != paragraphs[2].template_element);
        } else {
            try std.testing.expectEqual(paragraphs[0].template_element, paragraphs[2].template_element);
        }
        // Allocate a real character resource via an independent source paragraph;
        // raw style setter must exercise its own final writer with that ID.
        try std.testing.expect(try session.setCharacterProperties(0, 1, 0, 6, .{ .bold = true }));
        const id = (try regressionShapeAt(&session, 1, 0)).id.?;
        try std.testing.expect(try session.setCharacterFormat(0, 3, 0, 6, id));
        try regressionRoundtrip(&session, &original);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expect((try regressionShapeAt(&reopened, 1, 0)).bold);
        try std.testing.expect((try regressionShapeAt(&reopened, 3, 0)).bold);
    }
}

test "HWPX generated formatting regression UTF16 boundaries and selected style preservation" {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try regressionPrepare(&session);
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.SplitSurrogatePair, session.setCharacterProperties(0, 3, 7, 8, .{ .bold = true }));
    const rejected = try session.save();
    defer a.free(rejected);
    try std.testing.expectEqualSlices(u8, before, rejected);
    try std.testing.expect(try session.setCharacterProperties(0, 3, 6, 8, .{ .bold = true }));
    try std.testing.expect(try session.setCharacterProperties(0, 3, 0, 6, .{ .italic = true }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const prefix = try regressionShapeAt(&reopened, 3, 0);
    const emoji = try regressionShapeAt(&reopened, 3, 6);
    try std.testing.expect(prefix.italic and !prefix.bold);
    try std.testing.expect(emoji.bold and !emoji.italic);
    try std.testing.expectEqual(prefix.height, emoji.height);
}

fn regressionHistory(managed: bool) !void {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try regressionPrepare(&session);
    session.history_delta_managed = managed;
    var history = if (managed) try history_mod.History.initV2(&session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000 }) else try history_mod.History.init(&session, 16, 8_000_000);
    defer history.deinit();
    const before = try session.save();
    defer a.free(before);
    const commands = [_]history_mod.Command{
        .{ .kind = .character_properties, .paragraph = 3, .start = 6, .deleted = 2, .inserted = "", .character_properties = .{ .bold = true, .italic = true, .size = 1800 } },
        .{ .kind = .split, .paragraph = 3, .start = 6, .deleted = 0, .inserted = "" },
        .{ .kind = .merge, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" },
    };
    for (0..2) |iteration| for (commands) |command| {
        const changed = try history.apply(&session, command);
        if (iteration == 1 and command.kind == .character_properties) {
            try std.testing.expect(!changed);
        } else try std.testing.expect(changed);
    };
    const after = try session.save();
    defer a.free(after);
    // Second identical property patch is a no-op, so count actual revisions.
    const revisions = history.revision();
    for (0..revisions) |_| try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    for (0..revisions) |_| try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    var reopened = try editor.open(a, redone, .{});
    defer reopened.deinit();
    try regressionMetadata(&original, &reopened);
    const emoji = try regressionShapeAt(&reopened, 3, 6);
    try std.testing.expect(emoji.bold and emoji.italic);
    try std.testing.expectEqual(@as(?i32, 1800), emoji.height);
}

test "HWPX generated formatting regression repeat split merge direct history byte equivalence" {
    try regressionHistory(false);
}

test "HWPX generated formatting regression repeat split merge managed history byte equivalence" {
    try regressionHistory(true);
}

test "HWPX generated formatting regression allocation failure preserves bytes and history" {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    var failing = std.testing.FailingAllocator.init(a, .{});
    var session = try editor.open(failing.allocator(), bytes, .{});
    defer session.deinit();
    try regressionPrepare(&session);
    var history = try history_mod.History.init(&session, 8, 8_000_000);
    defer history.deinit();
    const before = try session.save();
    defer failing.allocator().free(before);
    // Deterministically fail the first command allocation. This checks rollback
    // at entry; exhaustive later allocation points belong to a separate audit.
    failing.fail_index = failing.alloc_index;
    try std.testing.expectError(error.OutOfMemory, history.apply(&session, .{
        .kind = .character_properties,
        .paragraph = 3,
        .start = 0,
        .deleted = 8,
        .inserted = "",
        .character_properties = .{ .bold = true },
    }));
    failing.fail_index = std.math.maxInt(usize);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const after = try session.save();
    defer failing.allocator().free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX generated formatting regression writer refuses unknown control beside section metadata" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:secPr/><p:ctrl><p:unknownRegression/></p:ctrl><p:t>TARGET😀</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    // Construct only the writer's text-site input so independent reader policy
    // cannot reject this negative case before the run serializer is exercised.
    var text: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(regression_xml.paragraph_uri, "t")) {
        text = index;
    };
    const at = text orelse return error.MissingRegressionText;
    const element = tree.elements[at];
    const rows = try a.alloc(@import("text_sites.zig").Site, 1);
    var sites: @import("text_sites.zig").Sites = .{ .items = rows };
    rows[0] = .{ .element_index = at, .start = element.start_tag.end, .end = element.end_tag.?.start, .text = try a.dupe(u8, "TARGET😀") };
    defer sites.deinit(a);
    const span: @import("character_style_paint.zig").Span = .{
        .start_unit = 0,
        .end_unit = 8,
        .site_start_unit = 0,
        .site_index = 0,
        .run_element = element.parent.?,
        .char_shape_id = 0,
    };
    try std.testing.expectError(error.UnsupportedInlineControl, @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, 100_000));
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX generated formatting regression sampled direct setter allocation rollback" {
    const a = std.testing.allocator;
    const bytes = try new_document.hwpx(a);
    defer a.free(bytes);
    // Bounded sampling, not an exhaustive all-allocation audit. Each attempt
    // starts from a fresh session and exercises the public atomic setter.
    for ([_]usize{ 0, 1, 8, 32, 128, 512 }) |offset| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        var session = try editor.open(failing.allocator(), bytes, .{});
        defer session.deinit();
        try regressionPrepare(&session);
        const before = try session.save();
        defer failing.allocator().free(before);
        failing.fail_index = failing.alloc_index + offset;
        const changed = session.setCharacterProperties(0, 3, 0, 8, .{ .bold = true }) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            const after = try session.save();
            defer failing.allocator().free(after);
            try std.testing.expectEqualSlices(u8, before, after);
            try std.testing.expect(!(try regressionShapeAt(&session, 3, 0)).bold);
            continue;
        };
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expect(changed);
        try std.testing.expect((try regressionShapeAt(&session, 3, 0)).bold);
    }
}
