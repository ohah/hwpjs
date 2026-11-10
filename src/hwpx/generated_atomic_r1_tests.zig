const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const Binding = @import("../model/formatting_binding.zig").State;
const m = @import("../model/formatting_patch.zig");
const Service = @import("../wasm/formatting_service.zig").Service(.hwpx);
const a = std.testing.allocator;
const ranges = [_]m.Range{.{ .startUnit = 0, .endUnit = 8 }};
const fields = [_][]const u8{ "character.bold", "character.italic", "character.size", "character.textColor", "paragraph.alignment", "reset.style" };
const Harness = struct {
    session: *editor.Session,
    history: History,
    lifetime: Binding,
    fn init() !Harness {
        const bytes = try @import("../new_document/root.zig").hwpx(a);
        defer a.free(bytes);
        return initInput(bytes);
    }
    fn initInput(bytes: []const u8) !Harness {
        const session = try a.create(editor.Session);
        errdefer a.destroy(session);
        session.* = try editor.open(a, bytes, .{});
        errdefer session.deinit();
        var history = try History.initV2(session, .{ .max_entries = 32, .max_checkpoint_bytes = 8_000_000 });
        errdefer history.deinit();
        for ([_]@import("editor_history.zig").Command{
            .{ .kind = .plain, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "HEADER" },
            .{ .kind = .split, .paragraph = 1, .start = 6, .deleted = 0, .inserted = "" },
            .{ .kind = .plain, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "BODY😀AB" },
            .{ .kind = .split, .paragraph = 2, .start = 8, .deleted = 0, .inserted = "" },
            .{ .kind = .plain, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "OTHER" },
        }) |command| try std.testing.expect(try history.apply(session, command));
        var lifetime: Binding = .{};
        try lifetime.open();
        return .{ .session = session, .history = history, .lifetime = lifetime };
    }
    fn deinit(self: *Harness) void {
        self.lifetime.close();
        self.history.deinit();
        self.session.deinit();
        a.destroy(self.session);
    }
    fn service(self: *Harness) Service {
        return .{ .backend = .{ .session = self.session, .allocator = a }, .history = &self.history, .lifetime = &self.lifetime };
    }
    fn binding(self: *Harness) m.Binding {
        return .{ .session = "s1", .revision = self.history.revision() };
    }
    fn query(self: *Harness, paragraph: u32) !std.json.Parsed(std.json.Value) {
        const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = paragraph, .ranges = &ranges }};
        const bytes = try self.service().query(a, .{ .binding = self.binding(), .selectors = &selectors, .fields = &fields });
        defer a.free(bytes);
        return std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always });
    }
};
fn row(query: std.json.Parsed(std.json.Value)) std.json.Value {
    return query.value.object.get("observations").?.object.get("perTarget").?.array.items[0];
}
fn apply(h: *Harness, patch: m.Patch) !bool {
    var query = try h.query(2);
    defer query.deinit();
    const targets = [_]m.Target{.{ .ref = row(query).object.get("ref").?.string, .ranges = &ranges }};
    return h.service().apply(a, .{ .binding = h.binding(), .targets = &targets, .patch = patch });
}
const combined: m.Patch = .{ .character = .{ .bold = true, .italic = true, .size = 1900, .text_color = 0x123456 }, .paragraph = .{ .alignment = .CENTER } };
fn values(h: *Harness, bold: bool, italic: bool, size: i64, alignment: []const u8) !void {
    var query = try h.query(2);
    defer query.deinit();
    const observed = row(query).object.get("fields").?.object;
    try std.testing.expectEqual(bold, observed.get("character.bold").?.object.get("value").?.bool);
    try std.testing.expectEqual(italic, observed.get("character.italic").?.object.get("value").?.bool);
    try std.testing.expectEqual(size, observed.get("character.size").?.object.get("value").?.integer);
    try std.testing.expectEqualStrings(alignment, observed.get("paragraph.alignment").?.object.get("value").?.string);
}
test "HX generated atomic r1 same session query combined noop one undo redo" {
    var h = try Harness.init();
    defer h.deinit();
    try std.testing.expect(h.session.sections[0].structure_values.?.paragraphs[1].source_ordinal == null);
    var control = try Harness.init();
    defer control.deinit();
    const before = try control.session.save();
    defer a.free(before);
    const rev = h.history.revision();
    try std.testing.expect(try apply(&h, combined));
    try std.testing.expectEqual(rev + 1, h.history.revision());
    try values(&h, true, true, 1900, "CENTER");
    try color(&h, 0x123456);
    try std.testing.expect(!try apply(&h, combined));
    try std.testing.expectEqual(rev + 1, h.history.revision());
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expect(try h.history.undo(h.session));
    const undone = try h.session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try h.history.redo(h.session));
    const redone = try h.session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "HX generated atomic r1 three reset scopes and reset noop" {
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        var h = try Harness.init();
        defer h.deinit();
        var initial = try h.query(2);
        defer initial.deinit();
        const observed = row(initial).object.get("fields").?.object;
        const size = observed.get("character.size").?.object.get("value").?.integer;
        const alignment = observed.get("paragraph.alignment").?.object.get("value").?.string;
        try std.testing.expect(try apply(&h, combined));
        const before = try h.session.save();
        defer a.free(before);
        const rev = h.history.revision();
        try std.testing.expect(try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(rev + 1, h.history.revision());
        try values(&h, scope == .paragraph, scope == .paragraph, if (scope == .paragraph) 1900 else size, if (scope == .character) "CENTER" else alignment);
        try color(&h, if (scope == .paragraph) 0x123456 else 0);
        try std.testing.expect(!try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(rev + 1, h.history.revision());
        const after = try h.session.save();
        defer a.free(after);
        try std.testing.expect(try h.history.undo(h.session));
        const undone = try h.session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try h.history.redo(h.session));
        const redone = try h.session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, after, redone);
    }
}

test "HX generated atomic r1 repeated split merge current text ordinal and stale binding" {
    var h = try Harness.init();
    defer h.deinit();
    for (0..3) |_| {
        var query = try h.query(2);
        defer query.deinit();
        const old_binding = h.binding();
        const target: m.Target = .{ .ref = row(query).object.get("ref").?.string, .ranges = &ranges };
        const id = h.session.sections[0].structure_values.?.paragraphs[1].generated_id;
        // Inserting before the selected owner changes its public ordinal.
        try std.testing.expect(try h.history.apply(h.session, .{ .kind = .split, .paragraph = 1, .start = 3, .deleted = 0, .inserted = "" }));
        try std.testing.expectEqual(id, h.session.sections[0].structure_values.?.paragraphs[2].generated_id);
        try std.testing.expectError(error.StaleFormattingBinding, h.service().apply(a, .{ .binding = old_binding, .targets = &.{target}, .patch = combined }));
        var moved = try h.query(3);
        defer moved.deinit();
        try std.testing.expect(try h.history.apply(h.session, .{ .kind = .merge, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
        try std.testing.expectEqual(id, h.session.sections[0].structure_values.?.paragraphs[1].generated_id);
        try std.testing.expect(try h.history.apply(h.session, .{ .kind = .split, .paragraph = 2, .start = 4, .deleted = 0, .inserted = "" }));
        try std.testing.expect(try h.history.apply(h.session, .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
        const text = try h.session.anchorText(0, 2);
        defer a.free(text);
        try std.testing.expectEqualStrings("BODY😀AB", text);
        _ = try apply(&h, combined);
        try values(&h, true, true, 1900, "CENTER");
    }
}

test "HX generated atomic r1 rejection scalar late target preserves redo and source bytes" {
    var h = try Harness.init();
    defer h.deinit();
    try std.testing.expect(try apply(&h, combined));
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    var q = try h.query(2);
    defer q.deinit();
    const ref = row(q).object.get("ref").?.string;
    const second_selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 3, .ranges = &.{.{ .startUnit = 0, .endUnit = 5 }} }};
    const second_bytes = try h.service().query(a, .{ .binding = h.binding(), .selectors = &second_selectors, .fields = &fields });
    defer a.free(second_bytes);
    var second = try std.json.parseFromSlice(std.json.Value, a, second_bytes, .{});
    defer second.deinit();
    const targets = [_]m.Target{
        .{ .ref = ref, .ranges = &ranges },
        .{ .ref = row(second).object.get("ref").?.string, .ranges = &.{.{ .startUnit = 0, .endUnit = 999 }} },
    };
    try std.testing.expectError(error.InvalidTextPosition, h.service().apply(a, .{ .binding = h.binding(), .targets = &targets, .patch = combined }));
    const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 2, .ranges = &.{.{ .startUnit = 5, .endUnit = 6 }} }};
    try std.testing.expectError(error.SplitSurrogatePair, h.service().query(a, .{ .binding = h.binding(), .selectors = &selectors, .fields = &.{} }));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try h.history.redo(h.session));
    try values(&h, true, true, 1900, "CENTER");
}

test "HX generated atomic r1 real history late command rollback after character mutation" {
    var h = try Harness.init();
    defer h.deinit();
    try std.testing.expect(try apply(&h, combined));
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    // A valid first command is applied before the second command fails. Use the
    // real lowering/History boundary; public service preflight rejects this earlier.
    const ops = [_]m.Operation{
        .{ .character = .{ .owner = .{ .section = 0, .paragraph = 2 }, .range = ranges[0], .patch = .{ .bold = true, .size = 1900 } } },
        .{ .paragraph_resource = .{ .owner = .{ .section = 0, .paragraph = 2 }, .id = 4294967295 } },
    };
    try std.testing.expectError(error.InvalidParagraphShapeReference, @import("../wasm/formatting_patch_commands.zig").apply(.hwpx, a, &h.history, h.session, &ops));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try h.history.redo(h.session));
    try values(&h, true, true, 1900, "CENTER");
}

fn nestedCase(opening: []const u8, closing: []const u8) !void {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var original = try editor.open(a, seed, .{});
    defer original.deinit();
    const xml = try std.mem.concat(a, u8, &.{
        "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HOST</p:t>",
        opening,
        "<p:p id='20' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>NEST😀AB</p:t></p:run></p:p>",
        closing,
        "</p:run></p:p></s:sec>",
    });
    defer a.free(xml);
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, original.original_header.?.source);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    defer lifetime.close();
    const service: Service = .{ .backend = .{ .session = &session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    const source = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 2, .ranges = &ranges }};
    const query = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &source, .fields = &.{"character.bold"} });
    defer a.free(query);
    // Creation must go through the actual Native Session/History split, not a
    // fabricated generated Paragraph or a backend mock.
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    const section = &session.sections[0];
    try std.testing.expect(section.structure_values.?.paragraphs[2].source_ordinal == null);
    const before = try session.save();
    defer a.free(before);
    const stats = history.stats();
    const generated = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 3, .ranges = &ranges }};
    try std.testing.expectError(error.UnsupportedFormattingOwner, service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &generated, .fields = &fields }));
    try std.testing.expectError(error.UnsupportedFormattingOwner, service.backend.owner(.{ .section = 0, .paragraph = 3 }));
    try std.testing.expectError(error.UnsupportedFormattingOwner, service.backend.resetResources(.{ .section = 0, .paragraph = 3 }, a));
    try std.testing.expectEqualDeep(stats, history.stats());
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    // A BODY template paired with the current nested sites is contradictory.
    const generated_row = &section.structure_values.?.paragraphs[2];
    const nested_template = generated_row.template_element;
    generated_row.template_element = section.structure_values.?.paragraphs[0].template_element;
    try std.testing.expectError(error.SourceBindingMismatch, service.backend.owner(.{ .section = 0, .paragraph = 3 }));
    generated_row.template_element = nested_template;
    // Changing the live alias's parent cannot reclassify immutable nested XML.
    const node = section.structure_values.?.paragraphs[2].template_element;
    const parent = section.tree.elements[node].parent;
    section.tree.elements[node].parent = 0;
    defer section.tree.elements[node].parent = parent;
    try std.testing.expectError(error.SourceBindingMismatch, service.backend.owner(.{ .section = 0, .paragraph = 3 }));
}

test "HX generated atomic r1 generated CELL drawing note caption refuse immutable nested owners" {
    try nestedCase("<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList>", "</p:subList></p:tc></p:tr></p:tbl>");
    try nestedCase("<p:rect><p:drawText><p:subList>", "</p:subList></p:drawText></p:rect>");
    try nestedCase("<p:ctrl><p:footNote><p:subList>", "</p:subList></p:footNote></p:ctrl>");
    try nestedCase("<p:tbl rowCnt='1' colCnt='1'><p:caption><p:subList>", "</p:subList></p:caption></p:tbl>");
}

test "HX generated atomic r1 request local owner cache current binding and original metadata" {
    var h = try Harness.init();
    defer h.deinit();
    const Backend = @import("formatting_projection.zig").Backend;
    {
        var snapshot: Backend.Snapshot = .{ .allocator = a };
        defer snapshot.deinit();
        const backend: Backend = .{ .session = h.session, .allocator = a, .snapshot = &snapshot };
        for (0..20) |_| _ = try backend.owner(.{ .section = 0, .paragraph = 2 });
        try std.testing.expectEqual(@as(u32, 1), snapshot.generated_owners.count());
        try std.testing.expectEqual(@as(u32, 1), snapshot.generated_sections.count());
        try std.testing.expectEqual(@as(u32, 1), snapshot.owner_views.count());
    }
    var query = try h.query(2);
    defer query.deinit();
    const ref = row(query).object.get("ref").?.string;
    const section = &h.session.sections[0];
    const generated = &section.structure_values.?.paragraphs[1];
    const saved_template = generated.template_element;
    generated.template_element = section.tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, h.service().resolve(ref));
    generated.template_element = saved_template;
    try std.testing.expect(try apply(&h, combined));
    const saved = try h.session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    for ([_][]const u8{ "secPr", "colPr" }) |local| {
        var count: usize = 0;
        for (reopened.sections[0].tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").paragraph_uri, local)) continue;
            count += 1;
            var found = false;
            for (section.tree.elements, 0..) |old, old_index| {
                if (old.is(@import("document_xml.zig").paragraph_uri, local) and std.mem.eql(u8, section.tree.sourceOf(old_index), reopened.sections[0].tree.sourceOf(index))) found = true;
            }
            try std.testing.expect(found);
            const owner = try @import("paragraph_site_owner.zig").ancestor(&reopened.sections[0].tree, index);
            try std.testing.expectEqual(reopened.sections[0].tree.elements[0].first_child.?, owner);
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }
}

fn replace(input: []const u8, needle: []const u8, value: []const u8) ![]u8 {
    try std.testing.expect(std.mem.indexOf(u8, input, needle) != null);
    return std.mem.replaceOwned(u8, a, input, needle, value);
}
fn customInput(missing: bool) ![]u8 {
    const bytes = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(bytes);
    var seed = try editor.open(a, bytes, .{});
    defer seed.deinit();
    const tree = &seed.original_header.?;
    var character: ?[]const u8 = null;
    var paragraph: ?[]const u8 = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").head_uri, "charPr")) character = tree.sourceOf(index);
        if (element.is(@import("document_xml.zig").head_uri, "paraPr")) paragraph = tree.sourceOf(index);
    }
    const char_id = try replace(character.?, "id=\"0\"", "id=\"7\"");
    defer a.free(char_id);
    const char_size = try replace(char_id, "height=\"1100\"", "height=\"2700\"");
    defer a.free(char_size);
    const char_bold = try replace(char_size, "</hh:charPr>", "<hh:bold/></hh:charPr>");
    defer a.free(char_bold);
    const para_id = try replace(paragraph.?, "id=\"0\"", "id=\"9\"");
    defer a.free(para_id);
    const para_align = try replace(para_id, "horizontal=\"LEFT\"", "horizontal=\"RIGHT\"");
    defer a.free(para_align);
    const char_all = try std.mem.concat(a, u8, &.{ char_bold, "</hh:charProperties>" });
    defer a.free(char_all);
    const para_all = try std.mem.concat(a, u8, &.{ para_align, "</hh:paraProperties>" });
    defer a.free(para_all);
    const h1 = try replace(tree.source, "</hh:charProperties>", char_all);
    defer a.free(h1);
    const h2 = try replace(h1, "</hh:paraProperties>", para_all);
    defer a.free(h2);
    const h3 = try replace(h2, "charProperties itemCnt=\"1\"", "charProperties itemCnt=\"2\"");
    defer a.free(h3);
    const h4 = try replace(h3, "paraProperties itemCnt=\"1\"", "paraProperties itemCnt=\"2\"");
    defer a.free(h4);
    const h5 = if (missing) try a.dupe(u8, h4) else try replace(h4, "</hh:styles>", "<hh:style id=\"5\" type=\"PARA\" name=\"Custom\" engName=\"Custom\" charPrIDRef=\"7\" paraPrIDRef=\"9\" nextStyleIDRef=\"5\" langID=\"1042\"/></hh:styles>");
    defer a.free(h5);
    const header = if (missing) try a.dupe(u8, h5) else try replace(h5, "styles itemCnt=\"1\"", "styles itemCnt=\"2\"");
    defer a.free(header);
    const section = try replace(seed.sections[0].tree.source, "styleIDRef=\"0\"", "styleIDRef=\"5\"");
    defer a.free(section);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
}

test "HX generated atomic r1 custom nonzero style three resets never guessed default" {
    const input = try customInput(false);
    defer a.free(input);
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| {
        var h = try Harness.initInput(input);
        defer h.deinit();
        // The selected generated paragraph still has current 11pt/LEFT, while
        // its real inherited style 5 resolves to distinct resources 7 and 9.
        try std.testing.expect(try apply(&h, .{ .character = .{ .bold = false, .italic = true, .size = 1900 }, .paragraph = .{ .alignment = .CENTER } }));
        const before = try h.session.save();
        defer a.free(before);
        const rev = h.history.revision();
        try std.testing.expect(try apply(&h, .{ .reset = scope }));
        try std.testing.expectEqual(rev + 1, h.history.revision());
        try values(&h, scope != .paragraph, scope == .paragraph, if (scope == .paragraph) 1900 else 2700, if (scope == .character) "CENTER" else "RIGHT");
        try std.testing.expect(!try apply(&h, .{ .reset = scope }));
        const after = try h.session.save();
        defer a.free(after);
        try std.testing.expect(try h.history.undo(h.session));
        const undone = try h.session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try h.history.redo(h.session));
        const redone = try h.session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, after, redone);
    }
}

test "HX generated atomic r1 missing style reset refuses preserves redo no default" {
    const input = try customInput(true);
    defer a.free(input);
    var h = try Harness.initInput(input);
    defer h.deinit();
    try std.testing.expect(try apply(&h, combined));
    try std.testing.expect(try h.history.undo(h.session));
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    var q = try h.query(2);
    defer q.deinit();
    const reset = row(q).object.get("fields").?.object.get("reset.style").?;
    try std.testing.expect(!reset.object.get("writable").?.bool);
    for ([_]m.ResetScope{ .character, .paragraph, .all }) |scope| try std.testing.expectError(error.MissingResetStyle, apply(&h, .{ .reset = scope }));
    try std.testing.expectEqualDeep(stats, h.history.stats());
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try h.history.redo(h.session));
    try values(&h, true, true, 1900, "CENTER");
}

test "HX generated atomic r1 generated BODY field markers preserved plain splice stays protected" {
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var original = try editor.open(a, seed, .{});
    defer original.deinit();
    const section_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>HEAD</p:t><p:ctrl><p:fieldBegin id='7' type='HYPERLINK' dirty='0'/></p:ctrl><p:t>BODY😀AB</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, section_xml, original.original_header.?.source);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer history.deinit();
    var lifetime: Binding = .{};
    try lifetime.open();
    defer lifetime.close();
    const service: Service = .{ .backend = .{ .session = &session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = 4, .deleted = 0, .inserted = "" }));
    try std.testing.expect(session.sections[0].structure_values.?.paragraphs[1].source_ordinal == null);
    const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = 2, .ranges = &ranges }};
    const query_bytes = try service.query(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .selectors = &selectors, .fields = &fields });
    defer a.free(query_bytes);
    var q = try std.json.parseFromSlice(std.json.Value, a, query_bytes, .{});
    defer q.deinit();
    const targets = [_]m.Target{.{ .ref = row(q).object.get("ref").?.string, .ranges = &ranges }};
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = "s1", .revision = history.revision() }, .targets = &targets, .patch = combined }));
    const before = try session.save();
    defer a.free(before);
    const stats = history.stats();
    try std.testing.expectError(error.ProtectedFieldRange, history.apply(&session, .{ .kind = .plain, .paragraph = 2, .start = 0, .deleted = 8, .inserted = "" }));
    try std.testing.expectEqualDeep(stats, history.stats());
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    var reopened = try editor.open(a, after, .{});
    defer reopened.deinit();
    for ([_][]const u8{ "fieldBegin", "fieldEnd" }) |local| {
        var count: usize = 0;
        for (reopened.sections[0].tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").paragraph_uri, local)) continue;
            count += 1;
            var found = false;
            for (session.sections[0].tree.elements, 0..) |old, old_index| {
                if (old.is(@import("document_xml.zig").paragraph_uri, local) and std.mem.eql(u8, session.sections[0].tree.sourceOf(old_index), reopened.sections[0].tree.sourceOf(index))) found = true;
            }
            try std.testing.expect(found);
        }
        try std.testing.expectEqual(@as(usize, 1), count);
    }
}

test "HX generated atomic r1 owner cache allocation failures and stale read scope" {
    var h = try Harness.init();
    defer h.deinit();
    const before = try h.session.save();
    defer a.free(before);
    const stats = h.history.stats();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, session: *editor.Session) !void {
            const Backend = @import("formatting_projection.zig").Backend;
            var snapshot: Backend.Snapshot = .{ .allocator = allocator };
            defer snapshot.deinit();
            const backend: Backend = .{ .session = session, .allocator = allocator, .snapshot = &snapshot };
            _ = try backend.owner(.{ .section = 0, .paragraph = 2 });
            _ = try backend.owner(.{ .section = 0, .paragraph = 3 });
            _ = try backend.owner(.{ .section = 0, .paragraph = 2 });
            // Only the new request-cache allocations use the failing allocator;
            // parsed reset resources retain the existing Session allocator.
            _ = try backend.resetResources(.{ .section = 0, .paragraph = 2 }, a);
            _ = try backend.resetResources(.{ .section = 0, .paragraph = 3 }, a);
            _ = try backend.resetResources(.{ .section = 0, .paragraph = 2 }, a);
            try std.testing.expectEqual(@as(u32, 2), snapshot.resets.count());
        }
    }.run, .{h.session});
    try std.testing.expectEqualDeep(stats, h.history.stats());
    const after = try h.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    var scope = try @import("paragraph_read_scope.zig").Scope.init(h.session, 0);
    defer scope.deinit();
    try scope.attach();
    // This is a lease-expiry counterexample, not an untracked raw data write.
    h.session.mutation_serial += 1;
    try std.testing.expectError(error.StaleParagraphReadScope, h.service().backend.owner(.{ .section = 0, .paragraph = 2 }));
}

fn color(h: *Harness, expected: i64) !void {
    var q = try h.query(2);
    defer q.deinit();
    try std.testing.expectEqual(expected, row(q).object.get("fields").?.object.get("character.textColor").?.object.get("value").?.integer);
}

fn depthInput(header: []const u8, wrappers: usize) ![]u8 {
    const xml = try depthXml(wrappers);
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
}
fn depthXml(wrappers: usize) ![]u8 {
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:depth-test'>");
    for (0..wrappers) |_| try xml.appendSlice(a, "<x:w>");
    for (0..wrappers) |_| try xml.appendSlice(a, "</x:w>");
    try xml.appendSlice(a, "<p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>BODY😀AB</p:t></p:run></p:p></s:sec>");
    return xml.toOwnedSlice(a);
}

test "HX generated atomic r1 admitted Session depth 256 enforced across options" {
    try std.testing.expect(!@hasField(editor.Options, "max_depth"));
    try std.testing.expect(!@hasField(editor.Options, "xml"));
    const seed = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(seed);
    var original = try editor.open(a, seed, .{});
    defer original.deinit();
    const accepted = try depthInput(original.original_header.?.source, 255);
    defer a.free(accepted);
    const rejected = try depthInput(original.original_header.?.source, 256);
    defer a.free(rejected);
    const rejected_xml = try depthXml(256);
    defer a.free(rejected_xml);
    for ([_]editor.Options{ .{}, .{
        .max_input_bytes = 128 * 1024 * 1024,
        .max_output_bytes = 256 * 1024 * 1024,
        .max_xml_bytes = 256 * 1024 * 1024,
        .max_text_bytes = 128 * 1024 * 1024,
        .max_sites = 2_000_000,
        .max_sections = 8192,
        .allow_observed_chart_ole_deviations = true,
    } }) |options| {
        var session = try editor.open(a, accepted, options);
        defer session.deinit();
        try std.testing.expectEqual(@as(usize, 256), session.sections[0].tree.xml_report.max_depth);
        try session.sections[0].validateSourceBasis();
        try std.testing.expectError(error.LimitExceeded, editor.open(a, rejected, options));
        var rebased = try @import("section_source_basis.zig").prepare(a, session.sections[0].tree.source, 0, 0, 1, options);
        defer rebased.deinit(a);
        try std.testing.expectEqual(@as(usize, 256), rebased.basis.tree.xml_report.max_depth);
        try std.testing.expectError(error.LimitExceeded, @import("section_source_basis.zig").prepare(a, rejected_xml, 0, 0, 1, options));
        var history = try History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
        const Backend = @import("formatting_projection.zig").Backend;
        var snapshot: Backend.Snapshot = .{ .allocator = a };
        defer snapshot.deinit();
        const backend: Backend = .{ .session = &session, .allocator = a, .snapshot = &snapshot };
        for (0..4) |_| {
            _ = try backend.owner(.{ .section = 0, .paragraph = 2 });
            const resources = try backend.resetResources(.{ .section = 0, .paragraph = 2 }, a);
            try std.testing.expectEqual(@as(u32, 0), resources.style_id);
        }
        try std.testing.expectEqual(@as(u32, 1), snapshot.generated_sections.count());
        try std.testing.expectEqual(@as(u32, 1), snapshot.generated_owners.count());
        try std.testing.expectEqual(@as(u32, 1), snapshot.owner_views.count());
        try std.testing.expectEqual(@as(u32, 1), snapshot.resets.count());
    }
}

test "HX generated atomic r1 reset same owner same style and distinct style query caches" {
    const input = try customInput(false);
    defer a.free(input);
    var seed = try editor.open(a, input, .{});
    defer seed.deinit();
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>BODY😀AB</p:t></p:run></p:p><p:p id='20' paraPrIDRef='0' styleIDRef='5'><p:run charPrIDRef='0'><p:t>BODY😀AB</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, seed.original_header.?.source);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000 });
    defer history.deinit();
    for ([_]@import("editor_history.zig").Command{
        .{ .kind = .split, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" },
        .{ .kind = .split, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" },
        .{ .kind = .split, .paragraph = 2, .start = 8, .deleted = 0, .inserted = "" },
    }) |command| try std.testing.expect(try history.apply(&session, command));
    const Backend = @import("formatting_projection.zig").Backend;
    var snapshot: Backend.Snapshot = .{ .allocator = a };
    defer snapshot.deinit();
    const backend: Backend = .{ .session = &session, .allocator = a, .snapshot = &snapshot };
    for (0..4) |_| {
        for ([_]usize{ 2, 3, 5 }) |paragraph| {
            const resources = try backend.resetResources(.{ .section = 0, .paragraph = paragraph }, a);
            try std.testing.expectEqual(@as(u32, if (paragraph == 5) 5 else 0), resources.style_id);
            try std.testing.expectEqual(@as(?u32, if (paragraph == 5) 7 else 0), resources.character);
            try std.testing.expectEqual(@as(?u32, if (paragraph == 5) 9 else 0), resources.paragraph);
        }
    }
    try std.testing.expectEqual(@as(u32, 3), snapshot.resets.count());
    try std.testing.expectEqual(@as(u32, 2), snapshot.reset_styles.?.resources.count());
    try std.testing.expectEqual(@as(u32, 2), snapshot.reset_styles.?.nodes.count());
    try std.testing.expectEqual(@as(u32, 2), snapshot.reset_styles.?.characters.nodes.count());
    try std.testing.expectEqual(@as(u32, 2), snapshot.reset_styles.?.paragraphs.nodes.count());
    try std.testing.expectEqual(@as(u32, 1), snapshot.generated_sections.count());
    try std.testing.expectEqual(@as(u32, 1), snapshot.owner_views.count());
}

// Frozen sequential style-node selection, separated from unchanged resource
// decoding. Compare actual XML trees, including malformed/nonselected entries.
fn sequentialStyleNode(tree: *const @import("xml_part_tree.zig").Tree, identity: u32) !usize {
    const head = @import("document_xml.zig").head_uri;
    var found: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(head, "style")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(head, "styles")) continue;
        const raw = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingResetStyle;
        if (try @import("table_xml_fields.zig").unsigned(a, raw, 4096) != identity) continue;
        if (found != null) return error.DuplicateResetStyle;
        found = index;
    }
    return found orelse error.MissingResetStyle;
}

test "HX generated atomic r1 reset style index preserves unselected duplicates invalid IDs and error order" {
    for ([_][]const u8{
        "<h:style id='0'/><h:style id='5'/><h:style id='5'/><h:style id='6'/>",
        "<h:style id='0'/><h:style id='5'/><h:style id='5'/><h:style id='bad'/>",
        "<h:style id='bad'/><h:style id='5'/><h:style id='5'/>",
        "<h:style id='0'/><h:style/><h:style id='5'/>",
        "<h:style id='0'/><h:style id='4294967296'/>",
        "<h:style id='0'/><h:style id='-1'/>",
        "<h:style id='0'/><h:style id='4294967295'/><x:style id='bad'/><x:wrapper><h:style id='bad'/></x:wrapper>",
    }, 0..) |styles, case_index| {
        const xml = try std.mem.concat(a, u8, &.{ "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign' secCnt='1'><h:refList><h:styles>", styles, "</h:styles></h:refList></h:head>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
        defer tree.deinit(a);
        var index: @import("formatting_style_reset.zig").Index = .{ .allocator = a };
        defer index.deinit();
        switch (case_index) {
            0 => {
                _ = try index.node(a, &tree, 0); // unselected duplicate 5 stays accepted
                try std.testing.expectError(error.DuplicateResetStyle, index.node(a, &tree, 5));
            },
            1 => {
                try std.testing.expectError(error.DuplicateResetStyle, index.node(a, &tree, 5));
                try std.testing.expectError(error.InvalidNonNegativeInteger, index.node(a, &tree, 0));
            },
            2 => try std.testing.expectError(error.InvalidNonNegativeInteger, index.node(a, &tree, 5)),
            3 => try std.testing.expectError(error.MissingResetStyle, index.node(a, &tree, 5)),
            4 => try std.testing.expectError(error.InvalidUnsigned32, index.node(a, &tree, 0)),
            5 => try std.testing.expectError(error.InvalidNonNegativeInteger, index.node(a, &tree, 0)),
            6 => {
                _ = try index.node(a, &tree, 0);
                _ = try index.node(a, &tree, 4294967295);
            },
            else => unreachable,
        }
        for (0..2) |_| {
            for ([_]u32{ 0, 5, 6, 999, 4294967295 }) |id| {
                const expected = sequentialStyleNode(&tree, id) catch |err| {
                    try std.testing.expectError(err, index.node(a, &tree, id));
                    continue;
                };
                try std.testing.expectEqual(expected, try index.node(a, &tree, id));
            }
        }
    }
}

test "HX generated atomic r1 reset resource indexes preserve generic FIRST match and malformed barriers" {
    inline for (.{ @import("formatting_style_reset.zig").ResourceKind.character, @import("formatting_style_reset.zig").ResourceKind.paragraph }) |kind| {
        const name = if (kind == .character) "charPr" else "paraPr";
        const group = if (kind == .character) "charProperties" else "paraProperties";
        for ([_][]const u8{
            "<h:R id='0'/><h:R id='5'/><h:R id='5'/><h:R id='6'/>",
            "<h:R id='5'/><h:R id='5'/><h:R id='bad'/><h:R id='6'/>",
            "<h:R id='bad'/><h:R id='5'/><h:R id='5'/>",
            "<h:R/><h:R id='5'/><h:R/>",
            "<h:R id='0'/><h:R id='4294967296'/><h:R id='5'/>",
            "<h:R id='0'/><h:R id='-1'/>",
            "<h:R id='0'/><h:R id='4294967295'/><x:R id='bad'/><x:wrapper><h:R id='bad'/></x:wrapper>",
        }, 0..) |items, case_index| {
            const named = try replace(items, "h:R", if (kind == .character) "h:charPr" else "h:paraPr");
            defer a.free(named);
            const xml = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign' secCnt='1'><h:refList><h:{s}>{s}</h:{s}></h:refList></h:head>", .{ group, named, group });
            defer a.free(xml);
            var tree = try @import("xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
            defer tree.deinit(a);
            var index: @import("formatting_style_reset.zig").Index = .{ .allocator = a };
            defer index.deinit();
            switch (case_index) {
                0, 1, 3 => {
                    _ = try index.resourceNode(a, &tree, kind, 5);
                },
                2 => try std.testing.expectError(error.InvalidNonNegativeInteger, index.resourceNode(a, &tree, kind, 5)),
                4 => {
                    _ = try index.resourceNode(a, &tree, kind, 0);
                    try std.testing.expectError(error.InvalidUnsigned32, index.resourceNode(a, &tree, kind, 5));
                },
                5 => {
                    _ = try index.resourceNode(a, &tree, kind, 0);
                    try std.testing.expectError(error.InvalidNonNegativeInteger, index.resourceNode(a, &tree, kind, 5));
                },
                6 => {
                    _ = try index.resourceNode(a, &tree, kind, 4294967295);
                },
                else => unreachable,
            }
            for (0..2) |_| {
                for ([_]u32{ 0, 5, 6, 999, 4294967295 }) |id| {
                    const expected = @import("formatting_preflight.zig").node(a, &tree, name, id) catch |err| {
                        try std.testing.expectError(err, index.resourceNode(a, &tree, kind, id));
                        continue;
                    };
                    try std.testing.expectEqual(expected, try index.resourceNode(a, &tree, kind, id));
                }
            }
        }
    }
}

test "HX generated atomic r1 reset resource index OOM is not cached and retries exact FIRST match" {
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties><h:charPr id='5'/><h:charPr id='5'/><h:charPr id='bad'/></h:charProperties><h:paraProperties><h:paraPr/><h:paraPr id='5'/><h:paraPr id='bad'/></h:paraProperties></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
    defer tree.deinit(a);
    inline for (.{ @import("formatting_style_reset.zig").ResourceKind.character, @import("formatting_style_reset.zig").ResourceKind.paragraph }) |kind| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        var index: @import("formatting_style_reset.zig").Index = .{ .allocator = failing.allocator() };
        defer index.deinit();
        failing.fail_index = failing.alloc_index;
        try std.testing.expectError(error.OutOfMemory, index.resourceNode(a, &tree, kind, 5));
        const resource = if (kind == .character) &index.characters else &index.paragraphs;
        try std.testing.expect(!resource.prepared);
        try std.testing.expect(resource.failure == null);
        try std.testing.expectEqual(@as(u32, 0), resource.nodes.count());
        failing.fail_index = std.math.maxInt(usize);
        const name = if (kind == .character) "charPr" else "paraPr";
        try std.testing.expectEqual(try @import("formatting_preflight.zig").node(a, &tree, name, 5), try index.resourceNode(a, &tree, kind, 5));
        try std.testing.expectError(error.InvalidNonNegativeInteger, index.resourceNode(a, &tree, kind, 999));
    }
}
