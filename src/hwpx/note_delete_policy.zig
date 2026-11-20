//! Reuse the current note-property reader; no guessed defaults or new vocabulary.
const std = @import("std");
const editor = @import("editor_session.zig");
const shapes = @import("section_note_shapes.zig");
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, kind: shapes.NoteKind) !void {
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    var report = try shapes.inspect(a, trees, .{});
    defer report.deinit(a);
    const selected = try a.alloc(?usize, trees.len);
    defer a.free(selected);
    @memset(selected, null);
    for (report.notes, 0..) |note, index| {
        if (note.kind != kind) continue;
        if (selected[note.section_ordinal] != null) return error.AmbiguousNoteNumberPolicy;
        if (note.other_attributes != 0 or note.count(.numbering) != 1) return error.UnsupportedNoteNumberPolicy;
        var known_children: usize = 0;
        for (note.child_counts) |count| known_children += count;
        if (known_children != note.direct_children) return error.UnsupportedNoteNumberPolicy;
        selected[note.section_ordinal] = index;
    }
    var policies: usize = 0;
    for (report.children) |child| {
        const note = report.notes[child.note_index];
        if (note.kind != kind or child.kind != .numbering) continue;
        if (child.other_attributes != 0 or child.direct_children != 0 or child.unknown_enums != 0) return error.UnsupportedNoteNumberPolicy;
        const policy = child.get(.numbering_type) orelse return error.UnsupportedNoteNumberPolicy;
        if (!std.mem.eql(u8, std.mem.trim(u8, policy, " \t\r\n"), "CONTINUOUS") or child.get(.new_num) == null) return error.UnsupportedNoteNumberPolicy;
        policies += 1;
    }
    if (policies != trees.len) return error.UnsupportedNoteNumberPolicy;
}
