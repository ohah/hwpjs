//! Prepare current values and validate serialized output before ownership exchange.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn sourceId(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize) !u32 {
    const attribute = (try tree.attributeValue(a, node, "", "paraPrIDRef")) orelse return error.MissingParagraphShapeReference;
    return @import("table_xml_fields.zig").unsigned(a, attribute, 4096);
}
pub fn currentId(session: *const editor.Session, section_index: usize, paragraph: usize) !u32 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    const index = paragraph - section.first_paragraph;
    if (index >= view.paragraphs.len) return error.SourceBindingMismatch;
    const selected = view.paragraphs[index];
    return selected.paragraph_shape_id orelse try sourceId(session.allocator, &section.tree, selected.template_element);
}

pub fn apply(session: *editor.Session, section_index: usize, paragraph: usize, id: u32) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    try @import("paragraph_style_resources.zig").requireExisting(ids, id);
    if (try currentId(session, section_index, paragraph) == id) return false;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    var values = if (section.structure_values) |*current| try current.clone(a) else try view.owned.?.clone(a);
    var transferred = false;
    defer if (!transferred) values.deinit(a);
    const selected = &values.paragraphs[paragraph - section.first_paragraph];
    selected.paragraph_shape_id = if (try sourceId(a, &section.tree, selected.template_element) == id) null else id;
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    defer if (!transferred) a.free(empty);
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section_index].structure_values = values;
    sections[section_index].sites = .{ .items = empty };
    var candidate = session.*;
    candidate.sections = sections;
    const output = try candidate.save();
    defer a.free(output);
    if (section.structure_values) |*old| old.deinit(a);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = values;
    transferred = true;
    return true;
}

test "HWPX paragraph format session preserves history refusal save reopen and direct reset" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const paragraph = session.sections[0].first_paragraph + 1;
    const before = try session.paragraphShapeId(0, paragraph);
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    var next = before;
    for (ids) |id| if (id != before) {
        next = id;
        break;
    };
    try std.testing.expect(next != before);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .paragraph_format, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_shape_id = next };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(next, try session.paragraphShapeId(0, paragraph));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(next, try reopened.paragraphShapeId(0, paragraph));
    try std.testing.expect(try history.undo(&session));
    var refused = command;
    refused.paragraph_shape_id = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidParagraphShapeReference, history.apply(&session, refused));
    var unchanged = command;
    unchanged.paragraph_shape_id = before;
    try std.testing.expect(!try history.apply(&session, unchanged));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expectEqual(next, try session.paragraphShapeId(0, paragraph));
    try std.testing.expect(try session.setParagraphFormat(0, paragraph, before));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
}

test "HWPX paragraph format history growth refusal rolls back source and retains redo" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const paragraph = session.sections[0].first_paragraph + 1;
    const original = try session.paragraphShapeId(0, paragraph);
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    var next = original;
    for (ids) |id| if (id != original) {
        next = id;
        break;
    };
    try std.testing.expect(next != original);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .paragraph_format, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_shape_id = next };
    try std.testing.expect(try history.apply(&session, command));
    const changed = try session.save();
    defer a.free(changed);
    try std.testing.expect(try history.undo(&session));
    const initial_size = try @import("editor_checkpoint.zig").size(&session, 4_000_000);
    history.max_checkpoint_bytes = initial_size;
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command));
    try std.testing.expectEqual(original, try session.paragraphShapeId(0, paragraph));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    history.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}
