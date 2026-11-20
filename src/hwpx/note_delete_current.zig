//! Re-observe exactly one reference at the current anchor-text UTF16 unit.
const std = @import("std");
const editor = @import("editor_session.zig");
const owners = @import("note_delete_owner.zig");
pub fn observe(session: *const editor.Session, target: @import("inline_object_insert.zig").Target, revision: u32) !owners.Request {
    const owner = target.owner orelse return error.InvalidNoteDeleteOwner;
    if (owner.kind == .createdCell) return error.UnsupportedNoteDeleteOwner;
    try @import("inline_object_placement.zig").checkCurrent(session, target.section, target.paragraph, owner, target.expected_text);
    const offset = try @import("../image/image_insertion.zig").byteOffset(target.expected_text, target.unit);
    if (!std.mem.startsWith(u8, target.expected_text[offset..], "\xef\xbf\xbc")) return error.MissingNoteDeleteOwner;
    const sites = try @import("note_reference_sites.zig").read(session.allocator, session, target.section);
    defer session.allocator.free(sites);
    var selected: ?usize = null;
    for (sites) |site| {
        if (site.paragraph != target.paragraph or site.anchor_unit != target.unit) continue;
        if (selected != null) return error.AmbiguousNoteDeleteOwner;
        selected = site.note_node;
    }
    return owners.observe(session.allocator, session, .{ .section = target.section, .note_node = selected orelse return error.MissingNoteDeleteOwner }, revision);
}
