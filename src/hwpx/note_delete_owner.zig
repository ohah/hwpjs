//! Native current-owner query for note deletion. XML ids are not session ids.
//! Public ABI/Core transport and generated-cell transfer remain separate layers.
const std = @import("std");
const editor = @import("editor_session.zig");
const owners = @import("note_mutation_owner.zig");
const plans = @import("note_removal_plan.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Selector = struct { section: usize, note_node: usize };
pub const Request = struct {
    selector: Selector,
    kind: owners.Kind,
    paragraph: usize,
    anchor_unit: usize,
    number: i32,
    note_tag_sha256: [32]u8,
    number_tag_sha256: [32]u8,
    inventory_sha256: [32]u8,
    source_sha256: [32]u8,
    session_address: usize,
    source_address: usize,
    mutation_serial: u64,
    history_revision: u32,
};
pub fn kind(tree: *const @import("xml_part_tree.zig").Tree, node: usize) owners.Kind {
    return if (tree.elements[node].is(uri, "footNote")) .foot else .end;
}
fn hashInteger(hash: *std.crypto.hash.sha2.Sha256, value: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(value), .little);
    hash.update(&bytes);
}
pub fn tagDigest(tree: *const @import("xml_part_tree.zig").Tree, node: usize) [32]u8 {
    const span = tree.elements[node].start_tag;
    return plans.digest(tree.source[span.start..span.end]);
}
/// Reject unknown content rather than silently deleting retained opaque data.
/// This is an incremental admission rule, not the final N02 support boundary.
fn bodyProtection(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, owner: owners.Owner) !void {
    const note = tree.elements[owner.note_node];
    for (tree.elements[owner.note_node + 1 ..], owner.note_node + 1..) |element, node| {
        if (element.start_tag.start >= note.end) break;
        var known = false;
        for ([_][]const u8{ "subList", "p", "run", "ctrl", "autoNum", "autoNumFormat", "t", "linesegarray", "lineseg" }) |name| {
            if (element.is(uri, name)) {
                known = true;
                break;
            }
        }
        if (!known) return error.UnsupportedNoteDeleteBody;
        if (!element.is(uri, "t") and !@import("element_whitespace_gaps.zig").empty(tree, node)) return error.UnsupportedNoteDeleteBody;
        if (element.is(uri, "t") and element.first_child != null) return error.UnsupportedNoteDeleteBody;
    }
    var cursor: ?usize = owner.note_node;
    while (cursor) |node| : (cursor = tree.elements[node].parent) {
        if (try tree.attributeValue(a, node, "", "lock")) |raw| {
            if (try @import("table_xml_fields.zig").boolean(a, raw, 4096)) return error.NoteDeleteReadOnly;
        }
    }
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, selector: Selector, revision: u32) !Request {
    if (selector.section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[selector.section].tree;
    const structural = try owners.read(tree, selector.note_node);
    try @import("page_settings_layout_cache.zig").validateSubtree(a, tree, .{ .root_node = structural.note_node });
    try bodyProtection(a, tree, structural);
    var protection = try @import("note_source_protection.zig").Context.init(session);
    defer protection.deinit();
    try protection.removedSubtree(selector.section, structural.control_node);
    try @import("note_delete_policy.zig").validate(a, session, if (structural.kind == .foot) .foot else .end);
    var result: ?Request = null;
    var hash = std.crypto.hash.sha2.Sha256.init(.{});
    for (session.sections, 0..) |*section, ordinal| {
        const sites = try @import("note_reference_sites.zig").read(a, session, ordinal);
        defer a.free(sites);
        var physical_notes: usize = 0;
        for (section.tree.elements) |element| {
            if (element.is(uri, "footNote") or element.is(uri, "endNote")) physical_notes += 1;
        }
        if (physical_notes != sites.len) return error.UnresolvedNoteDeleteNumber;
        var numbers = try @import("automatic_number_snapshot.zig").read(a, &section.tree);
        defer numbers.deinit(a);
        var number_map: std.AutoHashMap(usize, i32) = .init(a);
        defer number_map.deinit();
        for (numbers.rows) |row| {
            if (row.values.num) |number| try number_map.put(row.number_node, number);
        }
        for (sites) |site| {
            const selected = ordinal == selector.section and site.note_node == selector.note_node;
            const note_kind = kind(&section.tree, site.note_node);
            const number = number_map.get(site.number_node) orelse return error.UnresolvedNoteDeleteNumber;
            if (number <= 0) return error.UnresolvedNoteDeleteNumber;
            const note_hash = tagDigest(&section.tree, site.note_node);
            const number_hash = tagDigest(&section.tree, site.number_node);
            hashInteger(&hash, ordinal);
            hashInteger(&hash, site.paragraph);
            hashInteger(&hash, site.anchor_unit);
            hashInteger(&hash, @backingInt(note_kind));
            hash.update(&note_hash);
            hash.update(&number_hash);
            if (!selected) continue;
            if (result != null) return error.AmbiguousNoteDeleteOwner;
            const end = try std.math.add(usize, site.anchor_unit, 1);
            const exterior = try @import("field_source_outside_positions.zig").prepareAction(session, ordinal, site.paragraph, std.math.cast(u32, site.anchor_unit) orelse return error.LimitExceeded, std.math.cast(u32, end) orelse return error.LimitExceeded, .splice);
            if (exterior) |positions| session.allocator.free(positions);
            result = .{ .selector = selector, .kind = note_kind, .paragraph = site.paragraph, .anchor_unit = site.anchor_unit, .number = number, .note_tag_sha256 = note_hash, .number_tag_sha256 = number_hash, .inventory_sha256 = undefined, .source_sha256 = plans.digest(session.source), .session_address = @intFromPtr(session), .source_address = @intFromPtr(session.source.ptr), .mutation_serial = session.mutation_serial, .history_revision = revision };
        }
    }
    var request = result orelse return error.MissingNoteDeleteOwner;
    hash.final(&request.inventory_sha256);
    return request;
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: Request, revision: u32) !void {
    if (request.session_address != @intFromPtr(session) or request.source_address != @intFromPtr(session.source.ptr) or request.mutation_serial != session.mutation_serial or request.history_revision != revision) return error.StaleNoteDeleteOwner;
    const current = try observe(a, session, request.selector, revision);
    if (!std.meta.eql(current, request)) return error.StaleNoteDeleteOwner;
}
/// Serializer output must independently resolve the current logical anchor;
/// never reuse a physical node index after save/open.
pub fn resolveSaved(a: std.mem.Allocator, saved: *const editor.Session, request: Request) !Request {
    if (request.selector.section >= saved.sections.len) return error.StaleNoteDeleteOwner;
    const tree = &saved.sections[request.selector.section].tree;
    const sites = try @import("note_reference_sites.zig").read(a, saved, request.selector.section);
    defer a.free(sites);
    var selector: ?Selector = null;
    for (sites) |site| {
        if (site.paragraph != request.paragraph or site.anchor_unit != request.anchor_unit or kind(tree, site.note_node) != request.kind) continue;
        if (selector != null) return error.AmbiguousNoteDeleteOwner;
        selector = .{ .section = request.selector.section, .note_node = site.note_node };
    }
    const current = try observe(a, saved, selector orelse return error.StaleNoteDeleteOwner, request.history_revision);
    if (current.number != request.number or !std.mem.eql(u8, &current.note_tag_sha256, &request.note_tag_sha256) or !std.mem.eql(u8, &current.number_tag_sha256, &request.number_tag_sha256) or !std.mem.eql(u8, &current.inventory_sha256, &request.inventory_sha256)) return error.StaleNoteDeleteOwner;
    return current;
}
