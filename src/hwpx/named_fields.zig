//! Selected source-section names and current, owner-checked label observations.
const std = @import("std");
const Session = @import("editor_session.zig").Session;
const Marker = @import("field_markers.zig").Marker;
const Section = @import("editor_session.zig").Section;
const Labels = @import("field_label_targets.zig");
const selection = @import("xml_tree_selection.zig");
const owners = @import("paragraph_site_owner.zig");

const Location = struct { view: usize, startUnit: u32, endUnit: u32 };
const Row = struct {
    section: usize,
    element: usize,
    name: ?[]const u8,
    kind: []const u8,
    protection: enum { protected, unknown },
    sourceEditable: ?bool,
    text: ?[]const u8 = null,
    location: ?Location = null,
};
const View = struct { section: usize, paragraph: usize, text: []const u8 };
const Group = struct {
    paragraph: usize,
    rows: std.ArrayList(usize) = .empty,
};

// Existing label policy can rescan links, tree nodes and sites per label.
// Limit optional projection work independently of complete source-name enumeration.
const max_rows = 20_000;
const max_name_kind_bytes = 2 * 1024 * 1024;
const max_projection_work = 8_000_000;
const max_projection_text_bytes = 4 * 1024 * 1024;

const Inventory = struct {
    rows: std.ArrayList(Row) = .empty,
    views: std.ArrayList(View) = .empty,
    complete: bool,
    name_bytes: usize = max_name_kind_bytes,
    projection_work: usize = max_projection_work,
    projection_bytes: usize = max_projection_text_bytes,
};

pub fn encode(session: *const Session) ![]u8 {
    const a = session.allocator;
    var lease = try @import("source_field_analysis.zig").leaseForExterior(session);
    defer lease.deinit(a);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const markers = lease.source.report.markers;
    var inventory: Inventory = .{ .complete = !session.source_has_master_pages };
    var first: usize = 0;
    for (0..session.sections.len) |section| {
        const start = first;
        while (first < markers.len and markers[first].section_ordinal == section) : (first += 1) {}
        if (start == first) continue;
        try collectSection(session, scratch, section, markers, start, first, &inventory);
    }
    if (first != markers.len) return error.SourceBindingMismatch;
    return std.json.Stringify.valueAlloc(a, .{
        .format = "hwpx",
        .coverage = if (inventory.complete) "complete" else "partial",
        .rows = inventory.rows.items,
        .views = inventory.views.items,
    }, .{});
}

fn collectSection(
    session: *const Session,
    scratch: std.mem.Allocator,
    section: usize,
    all_markers: []const Marker,
    first: usize,
    end: usize,
    inventory: *Inventory,
) !void {
    const part = &session.sections[section];
    const markers = all_markers[first..end];
    const a = session.allocator;
    const frames = try selection.build(a, &part.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    var paragraphs: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer paragraphs.deinit(a);
    var current_markers: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer current_markers.deinit(a);
    if (inventory.projection_work > 0) {
        try indexParagraphs(a, part, &paragraphs, &current_markers);
    }
    var groups: std.AutoArrayHashMapUnmanaged(usize, Group) = .empty;
    defer groups.deinit(a);
    for (markers, first..) |marker, marker_index| {
        const begin = marker.begin orelse continue;
        if (marker.element_index >= frames.len) return error.SourceBindingMismatch;
        if (!frames[marker.element_index].active) continue;
        const kind = begin.type_raw orelse "UNKNOWN";
        const bytes = kind.len +| if (begin.name) |name| name.len else 0;
        if (inventory.rows.items.len == max_rows or bytes > inventory.name_bytes) {
            inventory.complete = false;
            continue;
        }
        inventory.name_bytes -= bytes;
        const owner = @import("field_marker_ownership.zig").paragraph(&part.tree, frames, marker.element_index) catch |err| switch (err) {
            error.UnsupportedFieldOwnership => blk: {
                inventory.complete = false;
                break :blk null;
            },
            else => return err,
        };
        const index = inventory.rows.items.len;
        try inventory.rows.append(scratch, .{
            .section = section,
            .element = marker.element_index,
            .name = begin.name,
            .kind = if (kind.len == 0) "UNKNOWN" else kind,
            .protection = if (begin.editable == false) .protected else .unknown,
            .sourceEditable = begin.editable,
        });
        const owner_element = owner orelse continue;
        const paragraph = paragraphs.get(owner_element) orelse continue;
        const end_index = marker.matched_marker_index orelse continue;
        if (end_index <= marker_index or end_index >= end) return error.SourceBindingMismatch;
        const closing = all_markers[end_index];
        if (closing.kind != .end or closing.matched_marker_index != marker_index)
            return error.SourceBindingMismatch;
        const end_owner = @import("field_marker_ownership.zig").paragraph(&part.tree, frames, closing.element_index) catch |err| switch (err) {
            error.UnsupportedFieldOwnership => continue,
            else => return err,
        };
        if (owner_element != end_owner) continue;
        // An individual label range can be a paragraph's portion of a longer
        // field. Materialized markers must still close in the same current row.
        if (part.structure_values) |*values| {
            const current = &values.paragraphs[paragraph - part.first_paragraph];
            if (current.field_positions != null and
                (current_markers.get(marker.element_index) != paragraph or
                    current_markers.get(closing.element_index) != paragraph))
                continue;
        }
        const entry = try groups.getOrPut(a, paragraph);
        if (!entry.found_existing) entry.value_ptr.* = .{ .paragraph = paragraph };
        try entry.value_ptr.rows.append(scratch, index);
    }
    const base = part.tree.elements.len +| part.locations.len +| all_markers.len +| session.sections.len;
    // A label query can check all markers/ranges in this section against every candidate.
    const group_work = base +| (markers.len *| base);
    for (groups.values()) |group| {
        if (group_work > inventory.projection_work or inventory.projection_bytes == 0) break;
        inventory.projection_work -= group_work;
        try projectGroup(session, scratch, section, group, inventory.rows.items, &inventory.views, &inventory.projection_bytes);
    }
}

fn indexParagraphs(
    a: std.mem.Allocator,
    part: *const Section,
    paragraphs: *std.AutoHashMapUnmanaged(usize, usize),
    markers: *std.AutoHashMapUnmanaged(usize, usize),
) !void {
    const uri = @import("document_xml.zig").section_uri;
    if (part.structure_values) |*values| {
        for (values.paragraphs, 0..) |row, index| {
            const paragraph = part.first_paragraph + index;
            if (row.field_positions) |positions| for (positions) |position| {
                const result = try markers.getOrPut(a, position.element_index);
                if (result.found_existing) return error.SourceBindingMismatch;
                result.value_ptr.* = paragraph;
            };
            if (row.generated_id != null or row.pieces != null) continue;
            if (row.template_element >= part.tree.elements.len) return error.SourceBindingMismatch;
            const parent = part.tree.elements[row.template_element].parent orelse continue;
            if (!part.tree.elements[parent].is(uri, "sec")) continue;
            const result = try paragraphs.getOrPut(a, row.template_element);
            if (result.found_existing) return error.SourceBindingMismatch;
            result.value_ptr.* = paragraph;
        }
        return;
    }
    if (part.locations.len != part.sites.items.len) return error.SourceBindingMismatch;
    const first = part.source_first_paragraph orelse part.first_paragraph;
    for (part.locations, part.sites.items) |location, site| {
        const owner = try owners.ancestor(&part.tree, site.element_index);
        const parent = part.tree.elements[owner].parent orelse continue;
        if (!part.tree.elements[parent].is(uri, "sec")) continue;
        if (location.paragraph_ordinal < first) return error.SourceBindingMismatch;
        const paragraph = part.first_paragraph + (location.paragraph_ordinal - first);
        if (paragraph > part.last_paragraph) return error.SourceBindingMismatch;
        const result = try paragraphs.getOrPut(a, owner);
        if (result.found_existing and result.value_ptr.* != paragraph) return error.SourceBindingMismatch;
        result.value_ptr.* = paragraph;
    }
}

fn projectGroup(session: *const Session, scratch: std.mem.Allocator, section: usize, group: Group, rows: []Row, views: *std.ArrayList(View), text_budget: *usize) !void {
    const a = session.allocator;
    const labels = session.fieldLabels(section, group.paragraph) catch |err| switch (err) {
        error.InvalidFieldLinks, error.UnsupportedStructuralFieldEdit, error.UnsupportedTextPositionProjection => return,
        else => return err,
    };
    defer a.free(labels);
    if (labels.len == 0) return;
    const text = @import("field_label_display_text.zig").readWithLabels(session, section, group.paragraph, labels) catch |err| switch (err) {
        error.UnsupportedFieldLabelDisplay, error.UnsupportedStructuralFieldEdit, error.UnsupportedTextPositionProjection => return,
        else => return err,
    };
    defer a.free(text);
    if (text.len > text_budget.*) return;

    var by_element: std.AutoHashMapUnmanaged(usize, Labels.Target) = .empty;
    defer by_element.deinit(a);
    for (labels) |label| {
        const item = try by_element.getOrPut(a, label.begin_element);
        if (item.found_existing) return error.SourceBindingMismatch;
        item.value_ptr.* = label;
    }
    const Match = struct {
        index: usize,
        target: Labels.Target,
        fn less(_: void, lhs: @This(), rhs: @This()) bool {
            if (lhs.target.start == rhs.target.start) return lhs.target.end < rhs.target.end;
            return lhs.target.start < rhs.target.start;
        }
    };
    var matches: std.ArrayList(Match) = .empty;
    defer matches.deinit(a);
    for (group.rows.items) |index| {
        if (by_element.get(rows[index].element)) |target| try matches.append(a, .{ .index = index, .target = target });
    }
    std.mem.sort(Match, matches.items, {}, Match.less);
    const view = views.items.len;
    const owned_text = try scratch.dupe(u8, text);
    const bytePosition = @import("text_site_edit.zig").bytePosition;
    var cursor: usize = 0;
    var unit: u32 = 0;
    var used = false;
    var previous_end: u32 = 0;
    for (matches.items, 0..) |match, index| {
        const label = match.target;
        if (label.end < label.start) return error.SourceBindingMismatch;
        const overlaps = label.start < previous_end or
            (index + 1 < matches.items.len and matches.items[index + 1].target.start < label.end);
        previous_end = @max(previous_end, label.end);
        if (overlaps) continue;
        const start = cursor + try bytePosition(owned_text[cursor..], label.start - unit);
        const end = start + try bytePosition(owned_text[start..], label.end - label.start);
        if (end - start > text_budget.* - text.len) break;
        text_budget.* -= end - start;
        const row = &rows[match.index];
        row.text = owned_text[start..end];
        row.location = .{ .view = view, .startUnit = label.start, .endUnit = label.end };
        cursor = end;
        unit = label.end;
        used = true;
    }
    if (used) {
        text_budget.* -= text.len;
        try views.append(scratch, .{ .section = section, .paragraph = group.paragraph, .text = owned_text });
    }
}
