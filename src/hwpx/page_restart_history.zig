//! Current owner proof and isolated document candidate for managed History2.
const std = @import("std");
const editor = @import("editor_session.zig");
const source = @import("page_restart_edit.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
pub const Observation = struct { target: source.Target, paragraph: usize, ticket: epoch.Ticket, revision: u32 };
pub const Request = struct { before: Observation, number: u16 };
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, section: usize, control: usize, ticket: epoch.Ticket, revision: u32) !Observation {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    for (session.sections) |current| if (current.created_tables.entries.items.len != 0) return error.UnsupportedInsertPendingTable;
    const target = try source.capture(a, &session.sections[section].tree, control);
    const paragraph = try source.currentParagraph(a, session, target);
    const positions = try @import("field_source_outside_positions.zig").prepareAction(session, section, paragraph, 0, 0, .whole_anchored);
    if (positions) |owned| session.allocator.free(owned);
    return .{ .target = target, .paragraph = paragraph, .ticket = ticket, .revision = revision };
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: Request, ticket: epoch.Ticket, revision: u32) !bool {
    if (!std.meta.eql(request.before.ticket, ticket) or request.before.revision != revision) return error.StalePageRestartBinding;
    const target = request.before.target;
    const current = try observe(a, session, target.section, target.control_node, ticket, revision);
    if (!std.meta.eql(request.before, current)) return error.StalePageRestartBinding;
    if (request.number == 0) return error.InvalidPageRestartNumber;
    return request.number != current.target.number;
}
pub fn prepare(a: std.mem.Allocator, live: *const editor.Session, before: []const u8, request: Request, ticket: epoch.Ticket, revision: u32) !?editor.Session {
    if (!try validate(a, live, request, ticket, revision)) return null;
    var saved = try editor.open(a, before, live.options);
    defer saved.deinit();
    const target = request.before.target;
    if (target.section >= saved.sections.len) return error.InvalidSectionIndex;
    // No source-index rebind: saving pending edits must not change this owner tree.
    const tree = &saved.sections[target.section].tree;
    const changed = (try source.write(a, tree, target, request.number, live.options.max_xml_bytes)) orelse return null;
    defer a.free(changed);
    const bytes = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = saved.sections[target.section].entry_index, .bytes = changed }}, .{ .max_output_bytes = live.options.max_output_bytes });
    defer a.free(bytes);
    return try editor.open(a, bytes, live.options);
}
