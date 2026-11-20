//! Original-site exterior preparation for a raw/selected field-link disagreement.
//! This never grants label editing or changes the raw Session writer policy.
const std = @import("std");
const editor = @import("editor_session.zig");
const analysis = @import("source_field_analysis.zig");
const publication = @import("document_text_source_publication.zig");
const SiteKey = struct { node: usize, start: usize, end: usize };

/// Null retains the existing path byte for byte for a valid raw field graph.
/// Only an actual raw InvalidFieldLinks plus a strictly valid selected graph
/// enters this request-local path. No error is converted into editing authority.
pub fn prepare(session: *editor.Session, observation: *const @import("document_text_snapshot.zig").Observation, intent: *const @import("../model/document_replace_all.zig").Plan) !?publication.Publication {
    try observation.assertCurrent(session);
    if (!session.history_delta_managed) return error.HistoryProtocolRequired;
    const a = session.allocator;
    var raw = analysis.leaseForExterior(session) catch |err| switch (err) {
        error.InvalidFieldLinks => return try prepareSelected(session, observation, intent),
        else => return err,
    };
    raw.deinit(a);
    return null;
}

fn prepareSelected(session: *editor.Session, observation: *const @import("document_text_snapshot.zig").Observation, intent: *const @import("../model/document_replace_all.zig").Plan) !publication.Publication {
    const a = session.allocator;
    var selected = try analysis.selectedForExterior(session);
    defer selected.deinit(a);
    // Pending structural owners require their own field marker/value adapter.
    // Reject the whole intent before publication; never omit a matched owner.
    for (session.sections) |section| {
        if (section.structure_values != null or section.created_tables.entries.items.len != 0)
            return error.UnsupportedDocumentTextFieldSourceMetadata;
    }
    const slots = try a.alloc(?publication.Section, session.sections.len);
    @memset(slots, null);
    var result: publication.Publication = .{ .allocator = a, .owner = session, .source_pointer = session.source.ptr, .sections_pointer = session.sections.ptr, .serial = session.mutation_serial, .active = session.history_transaction_active, .sections = slots };
    errdefer result.deinit();
    // Bucket targets once, preserving planner order without paragraph*group scans.
    const Group = @import("../model/document_replace_all.zig").Group;
    const buckets = try a.alloc(std.ArrayList(Group), session.sections.len);
    defer a.free(buckets);
    @memset(buckets, .empty);
    defer for (buckets) |*bucket| bucket.deinit(a);
    for (intent.groups) |group| {
        const row = try observation.snapshot.rowFor(group.row.ref);
        if (row != group.row or row.section >= slots.len) return error.SourceBindingMismatch;
        if (row.source != .paragraph) return error.UnsupportedDocumentTextFieldSourceMetadata;
        try buckets[row.section].append(a, group);
    }
    const field_buckets = try a.alloc(std.ArrayList(usize), session.sections.len);
    defer a.free(field_buckets);
    @memset(field_buckets, .empty);
    defer for (field_buckets) |*bucket| bucket.deinit(a);
    for (selected.report.markers, 0..) |marker, index| {
        if (marker.kind == .begin) try field_buckets[marker.section_ordinal].append(a, index);
    }
    for (session.sections, buckets, 0..) |*section, groups, section_index| {
        if (groups.items.len == 0) continue;
        try section.validateSourceBasis();
        const tree = &section.tree;
        var counters: @import("section_text.zig").Report = .{ .paragraphs = (section.source_first_paragraph orelse section.first_paragraph) - 1 };
        var values = try @import("paragraph_structure_collect.zig").collect(a, tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
        defer values.deinit(a);
        var kernel = try @import("control_text_read_context.zig").Context.init(a, tree, values.paragraphs, try @import("document_text_read_options.zig").fromSession(session.options));
        defer kernel.deinit();
        const protected = try protectedNodes(a, tree, selected.report.markers, field_buckets[section_index].items);
        defer a.free(protected);
        var indices: std.AutoHashMapUnmanaged(SiteKey, usize) = .empty;
        defer indices.deinit(a);
        for (section.sites.items, 0..) |site, index| {
            const entry = try indices.getOrPut(a, .{ .node = site.element_index, .start = site.start, .end = site.end });
            if (entry.found_existing) return error.DuplicateCurrentTextOwner;
            entry.value_ptr.* = index;
        }
        var source = try section.sites.clone(a);
        var moved = false;
        defer if (!moved) source.deinit(a);
        var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer seen.deinit(a);
        var changed = false;
        for (groups.items) |group| {
            const row = group.row;
            const index = row.source.paragraph;
            if (index >= values.paragraphs.len or (try seen.getOrPut(a, index)).found_existing) return error.DuplicateTextTransactionTarget;
            if (index >= observation.pending_positions[section_index].len) return error.SourceBindingMismatch;
            if (observation.pending_positions[section_index][index].len != 0) return error.UnsupportedDocumentTextFieldSourceMetadata;
            const paragraph = &values.paragraphs[index];
            const ordinal = paragraph.source_ordinal orelse return error.SourceBindingMismatch;
            // Shared writer admission is mandatory in addition to read coverage.
            // Narrow Sites keep this legacy local policy from scanning all rows.
            const locations = try a.alloc(@import("section_text.zig").Location, paragraph.sites.items.len);
            defer a.free(locations);
            for (paragraph.sites.items, locations) |site, *location| {
                const source_index = indices.get(.{ .node = site.element_index, .start = site.start, .end = site.end }) orelse return error.SourceBindingMismatch;
                location.* = section.locations[source_index];
                if (location.paragraph_ordinal != ordinal) return error.SourceBindingMismatch;
            }
            try @import("plain_paragraph_policy.zig").validateForFieldText(tree, &paragraph.sites, locations, ordinal);
            const read = try kernel.rowByIndex(index, paragraph.template_element);
            if (read.coverage != .complete or read.text == null or !std.mem.eql(u8, read.text.?, row.text)) return error.SourceBindingMismatch;
            // This first adapter changes one physical text owner per edit. A
            // cross-site field/marker affinity adapter remains a separate task.
            var segment_cursor: usize = 0;
            var prior_end: u32 = 0;
            for (group.edits) |edit| {
                if (edit.end <= edit.start or edit.start < prior_end) return error.UnsupportedDocumentTextFieldSourceRange;
                prior_end = edit.end;
                while (segment_cursor < read.segments.len and read.segments[segment_cursor].end_unit <= edit.start) : (segment_cursor += 1) {}
                if (segment_cursor >= read.segments.len) return error.InvalidTextPosition;
                const segment = read.segments[segment_cursor];
                if (segment.kind != .text or edit.start < segment.start_unit or edit.end > segment.end_unit)
                    return error.UnsupportedDocumentTextFieldSourceRange;
                const site = paragraph.sites.items[segment.index];
                if (site.element_index >= protected.len or protected[site.element_index]) return error.ProtectedFieldRange;
            }
            var text = try @import("text_splice_transaction.zig").prepareManyProjected(a, &paragraph.sites, read.segments, group.edits, .{ .max_bytes = session.options.max_text_bytes, .replacement_inheritance = .first_replaced });
            defer text.deinit();
            changed = (try text.commit(&paragraph.sites)) or changed;
            for (paragraph.sites.items) |site| {
                const source_index = indices.get(.{ .node = site.element_index, .start = site.start, .end = site.end }) orelse return error.SourceBindingMismatch;
                if (std.mem.eql(u8, source.items[source_index].text, site.text)) continue;
                const bytes = try a.dupe(u8, site.text);
                source.releaseText(a, source_index);
                source.items[source_index].text = bytes;
            }
        }
        var bytes: usize = 0;
        for (source.items) |site| {
            if (site.text.len > session.options.max_text_bytes -| bytes) return error.LimitExceeded;
            bytes += site.text.len;
        }
        if (changed) {
            slots[section_index] = .{ .values = null, .sites = source, .original_values = null, .original_sites = section.sites.items.ptr };
            moved = true;
        }
    }
    try observation.assertCurrent(session);
    try result.validateCurrent(session);
    return result;
}

/// Linear physical-subtree boundaries and interval differences. No sorting,
/// parent-prefix scans, field*paragraph projection, or u32 ordinal-range loops.
fn protectedNodes(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, markers: []const @import("field_markers.zig").Marker, beginnings: []const usize) ![]bool {
    const after = try a.alloc(usize, tree.elements.len);
    defer a.free(after);
    for (after, 0..) |*end, index| end.* = index + 1;
    var cursor = after.len;
    while (cursor != 0) {
        cursor -= 1;
        if (tree.elements[cursor].parent) |parent| {
            if (parent >= cursor) return error.SourceBindingMismatch;
            after[parent] = @max(after[parent], after[cursor]);
        }
    }
    const diff = try a.alloc(i64, tree.elements.len + 1);
    defer a.free(diff);
    @memset(diff, 0);
    for (beginnings) |index| {
        if (index >= markers.len) return error.InvalidFieldLinks;
        const begin = markers[index];
        if (begin.kind != .begin) return error.InvalidFieldLinks;
        const matched = begin.matched_marker_index orelse return error.InvalidFieldLinks;
        if (matched >= markers.len or begin.element_index >= after.len) return error.InvalidFieldLinks;
        const end = markers[matched];
        if (end.section_ordinal != begin.section_ordinal or end.kind != .end or after[begin.element_index] > end.element_index or end.element_index >= after.len) return error.InvalidFieldLinks;
        // The fieldBegin subtree is owned metadata, not exterior document text.
        // Nearest-paragraph ownership must not erase this enclosing boundary.
        diff[begin.element_index] += 1;
        // End-marker descendants are opaque metadata as well; do not expose
        // a nearest-paragraph editing path inside either marker subtree.
        diff[after[end.element_index]] -= 1;
    }
    const result = try a.alloc(bool, tree.elements.len);
    var depth: i64 = 0;
    for (result, 0..) |*value, index| {
        depth += diff[index];
        value.* = depth != 0;
    }
    return result;
}
