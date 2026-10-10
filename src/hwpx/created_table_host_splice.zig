//! Atomic plain-text and generated-anchor transaction; structural edits stay gated.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool, comptime operation: anytype) anyerror!bool {
    const a = session.allocator;
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (anchored or try @import("formula_section_save.zig").hasFormula(a, &session.sections[section].tree)) return error.UnsupportedCreatedTableHostEdit;
    const host = try @import("created_table_anchor.zig").capture(a, session, section, paragraph, start);
    const inserted_units = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    var candidate = try session.sections[section].created_tables.clone(a);
    defer candidate.deinit(a);
    for (candidate.entries.items) |*entry| {
        if (entry.anchor.section != section) return error.SourceBindingMismatch;
        if (std.meta.eql(entry.anchor.paragraph, host.paragraph)) entry.anchor.unit = try @import("created_table_anchor_splice.zig").unit(entry.anchor.unit, start, deleted, inserted_units);
    }
    var before = try @import("editor_checkpoint.zig").capture(session, session.options.max_output_bytes);
    defer before.deinit();
    std.mem.swap(@import("created_table_values.zig").Values, &session.sections[section].created_tables, &candidate);
    const changed = operation(session, section, paragraph, start, deleted, inserted, anchored) catch |err| {
        try before.rollback(session);
        return err;
    };
    if (!changed) {
        try before.rollback(session);
        return false;
    }
    const saved = session.save() catch |err| {
        try before.rollback(session);
        return err;
    };
    a.free(saved);
    return true;
}
