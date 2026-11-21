//! One physical tree/digest/current-owner index. Commit re-observes the selected owner.
const std = @import("std");
const editor = @import("editor_session.zig");
const H = @import("page_restart_history.zig");
const hp = @import("document_xml.zig").paragraph_uri;
pub const Candidate = struct { control: usize, number: ?u16 = null, observation: ?H.Observation = null, reason: ?[]const u8 = null };
const Owner = struct { paragraph: usize, bad: bool = false };
pub const Context = struct { ticket: @import("../model/history_mutation_epoch.zig").Ticket, revision: u32, pending_tables: bool };
pub fn makeContext(session: *const editor.Session, ticket: @import("../model/history_mutation_epoch.zig").Ticket, revision: u32) Context {
    var pending = false;
    for (session.sections) |current| if (current.created_tables.entries.items.len != 0) {
        pending = true;
        break;
    };
    return .{ .ticket = ticket, .revision = revision, .pending_tables = pending };
}
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, ticket: @import("../model/history_mutation_epoch.zig").Ticket, revision: u32) ![]Candidate {
    return readWithContext(a, session, section_index, makeContext(session, ticket, revision));
}
pub fn readWithContext(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, context: Context) ![]Candidate {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.first_paragraph == 0) return error.InvalidParagraphIndex;
    const tree = &section.tree;
    if (tree.part_kind != .section or tree.section_ordinal != section_index) return error.InvalidPartKind;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    var owners: std.AutoHashMapUnmanaged(usize, Owner) = .empty;
    defer owners.deinit(a);
    for (view.paragraphs, 0..) |paragraph, ordinal| {
        const entry = try owners.getOrPut(a, paragraph.template_element);
        if (!entry.found_existing) entry.value_ptr.* = .{ .paragraph = try std.math.add(usize, section.first_paragraph, ordinal) } else entry.value_ptr.bad = true;
        if (paragraph.source_ordinal == null or paragraph.generated_id != null or paragraph.pieces != null) entry.value_ptr.bad = true;
    }
    var counts: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer counts.deinit(a);
    for (tree.elements) |element| {
        if (!element.is(hp, "newNum")) continue;
        const ctrl = element.parent orelse continue;
        const run = tree.elements[ctrl].parent orelse continue;
        const paragraph = tree.elements[run].parent orelse continue;
        const entry = try counts.getOrPut(a, paragraph);
        if (!entry.found_existing) entry.value_ptr.* = 0;
        entry.value_ptr.* += 1;
    }
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    const pending = context.pending_tables;
    var out: std.ArrayList(Candidate) = .empty;
    errdefer out.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(hp, "newNum")) continue;
        const fields = try @import("number_controls.zig").restartAt(scratch, scratch, tree, node);
        const kind = fields.get(.num_type) orelse continue;
        if (!std.mem.eql(u8, std.mem.trim(u8, kind, " \t\r\n"), "PAGE")) continue;
        if (out.items.len >= 20000) return error.LimitExceeded;
        var row: Candidate = .{ .control = node };
        const observed: ?H.Observation = admitted: {
            if (pending) {
                row.reason = "UnsupportedInsertPendingTable";
                break :admitted null;
            }
            const num = fields.num orelse {
                row.reason = "InvalidPageRestartNumber";
                break :admitted null;
            };
            if (num < 1 or num > 65535) {
                row.reason = "InvalidPageRestartNumber";
                break :admitted null;
            }
            row.number = @intCast(num);
            if (fields.other_attributes != 0 or element.first_child != null or !@import("element_whitespace_gaps.zig").empty(tree, node)) {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            }
            const ctrl = element.parent orelse {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            };
            const run = tree.elements[ctrl].parent orelse {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            };
            const paragraph = tree.elements[run].parent orelse {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            };
            if (!tree.elements[ctrl].is(hp, "ctrl") or !tree.elements[run].is(hp, "run") or !tree.elements[paragraph].is(hp, "p") or tree.elements[paragraph].parent != 0 or tree.elements[ctrl].first_child != node or element.next_sibling != null or !@import("element_whitespace_gaps.zig").empty(tree, ctrl)) {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            }
            if (counts.get(paragraph).? != 1) {
                row.reason = "AmbiguousPageRestart";
                break :admitted null;
            }
            const owner = owners.get(paragraph) orelse {
                row.reason = "MissingPageRestartOwner";
                break :admitted null;
            };
            if (owner.bad) {
                row.reason = "UnsupportedPageRestartOwner";
                break :admitted null;
            }
            // Field/protection admission remains in the existing History.observe on commit.
            // This inventory issues a source ref, not a blanket permission to mutate.
            break :admitted .{ .target = .{ .section = section_index, .control_node = node, .paragraph_node = paragraph, .number = @intCast(num), .section_digest = digest }, .paragraph = owner.paragraph, .ticket = context.ticket, .revision = context.revision };
        };
        row.observation = observed;
        try out.append(a, row);
    }
    return out.toOwnedSlice(a);
}
