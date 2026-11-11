const Session = @import("editor_session.zig").Session;
const Bullet = @import("../model/formatting_patch.zig").Bullet;

pub fn authorize(session: *Session, section_index: usize, paragraph: usize) !void {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    const selected = view.paragraphs[paragraph - section.first_paragraph];
    if (selected.source_ordinal == null or selected.generated_id != null or selected.pieces != null) return error.UnsupportedBulletOwner;
    const element = section.tree.elements[selected.template_element];
    const parent = element.parent orelse return error.UnsupportedBulletOwner;
    if (!section.tree.elements[parent].is("http://www.hancom.co.kr/hwpml/2011/section", "sec") or section.tree.elements[parent].parent != null) return error.UnsupportedBulletOwner;
    const uri = @import("document_xml.zig").paragraph_uri;
    var owned = try @import("paragraph_owned_elements.zig").Iterator.init(&section.tree, selected.template_element);
    while (try owned.next()) |node| {
        const content = section.tree.elements[node];
        if (!content.is(uri, "run") and !content.is(uri, "t") and !content.is(uri, "linesegarray") and !content.is(uri, "lineseg")) return error.UnsupportedBulletOwner;
    }
    if (selected.field_positions) |positions| if (positions.len != 0) return error.UnsupportedBulletOwner;
    if (selected.protected_positions) |positions| if (positions.len != 0) return error.UnsupportedBulletOwner;
}

pub fn apply(session: *Session, section: usize, paragraph: usize, value: Bullet) !bool {
    try authorize(session, section, paragraph);
    return @import("paragraph_alignment_session.zig").applyWithBullet(session, section, paragraph, null, .{}, null, .{}, .{}, value);
}

test "paragraph bullet history restores resources after checkpoint budget failure and preserves redo" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/lists-bullet.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const checkpoint = @import("editor_checkpoint.zig");
    const histories = @import("editor_history.zig");
    var history = try histories.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const initial_size = try checkpoint.size(&session, 4_000_000);
    history.max_checkpoint_bytes = initial_size;
    const command: histories.Command = .{ .kind = .paragraph_bullet, .section = 0, .paragraph = 5, .start = 0, .deleted = 0, .inserted = "", .paragraph_bullet = .{ .id = 7 } };
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command));
    try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    history.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    history.max_checkpoint_bytes = initial_size;
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command));
    history.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
