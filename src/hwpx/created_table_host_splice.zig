//! Atomic plain-text and generated-anchor transaction; structural edits stay gated.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn hasPending(session: *const editor.Session) bool {
    for (session.sections) |section| if (section.created_tables.entries.items.len != 0) return true;
    return false;
}

// Mode-level eligibility only; paragraph/range checks still belong to splice.
pub fn supportsMode(session: *const editor.Session, section: usize, anchored: bool) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (anchored and session.sections[section].structure_values != null) return false;
    if (session.sections[section].structure_values != null and try @import("formula_section_save.zig").hasFormula(session.allocator, &session.sections[section].tree)) return false;
    return true;
}

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool, comptime operation: anytype) anyerror!bool {
    return applyWithArguments(session, section, paragraph, start, deleted, inserted, anchored, operation, .{});
}

pub fn supportsFieldLabelMode(session: *const editor.Session, section: usize) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    return session.sections[section].structure_values == null and try supportsMode(session, section, false);
}

pub fn applyWithArguments(session: *editor.Session, section: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool, comptime operation: anytype, arguments: anytype) anyerror!bool {
    const a = session.allocator;
    if (!try supportsMode(session, section, anchored)) return error.UnsupportedCreatedTableHostEdit;
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
    const changed = @call(.auto, operation, .{ session, section, paragraph, start, deleted, inserted, anchored } ++ arguments) catch |err| {
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
    defer a.free(saved);
    @import("created_table_saved_formulas.zig").validate(session, saved) catch |err| {
        try before.rollback(session);
        return err;
    };
    return true;
}
