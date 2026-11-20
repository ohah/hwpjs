//! Only admitted marker, number attributes, and their exact paragraph caches.
const std = @import("std");
const editor = @import("editor_session.zig");
const writer = @import("xml_source_writer.zig");
const numbering = @import("note_delete_numbering.zig");
const plans = @import("note_removal_plan.zig");
pub fn package(a: std.mem.Allocator, session: *const editor.Session, before: []const u8, resolved: @import("note_delete_owner.zig").Request) ![]u8 {
    const selected = &session.sections[resolved.selector.section];
    const owner = try @import("note_mutation_owner.zig").read(&selected.tree, resolved.selector.note_node);
    const removal = try plans.prepare(a, &selected.tree, .{ .section = resolved.selector.section, .note_node = resolved.selector.note_node, .kind = resolved.kind, .expected_source_sha256 = plans.digest(selected.tree.source), .expected_marker_sha256 = plans.digest(selected.tree.sourceOf(owner.control_node)) });
    try removal.verifySource(&selected.tree);
    const updates = try numbering.prepare(a, session, resolved.selector, resolved.kind);
    defer a.free(updates);
    return @import("note_number_update_write.zig").package(a, session, before, resolved.selector.section, removal.changes(), updates);
}
