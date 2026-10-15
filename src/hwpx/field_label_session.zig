const std = @import("std");
const tree_module = @import("xml_part_tree.zig");

pub const Prepared = struct {
    field: @import("field_text_ranges.zig").Range,
    segments: []@import("paragraph_text_positions.zig").Segment,
    sites: *const @import("text_sites.zig").Sites,
    pub fn deinit(self: Prepared, a: std.mem.Allocator) void {
        a.free(self.segments);
    }
};

pub fn validatePreparedRange(prepared: Prepared, section: usize, start: u32, end: u32) !usize {
    const target = try @import("field_text_positions.zig").validateEdit(prepared.field, section, prepared.segments, start, end);
    try @import("paragraph_text_positions.zig").validateBoundary(prepared.sites, prepared.segments, start);
    try @import("paragraph_text_positions.zig").validateBoundary(prepared.sites, prepared.segments, end);
    return target;
}

/// Shared validation and current positions for queries and mutations.
pub fn prepare(self: anytype, section_index: usize, paragraph: usize, begin_element: usize) !Prepared {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const selected = &self.sections[section_index];
    if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
    const a = self.allocator;
    var analysis = try @import("source_field_analysis.zig").lease(self);
    defer analysis.deinit(a);
    const report = analysis.source.report;
    const ranges = analysis.source.fields;
    const frames = try @import("xml_tree_selection.zig").build(a, &selected.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    return prepareLinked(self, section_index, paragraph, begin_element, &report, ranges, frames);
}

/// Reuse one immutable report/range snapshot across a descriptor query.
pub fn prepareLinked(self: anytype, section_index: usize, paragraph: usize, begin_element: usize, report: *const @import("field_markers.zig").Report, ranges: []const @import("field_text_ranges.zig").Range, frames: []const @import("xml_tree_selection.zig").Frame) !Prepared {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const selected = &self.sections[section_index];
    if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
    const a = self.allocator;
    const field = find_field: {
        if (selected.structure_values) |values| {
            const index = paragraph - selected.first_paragraph;
            if (index >= values.paragraphs.len) return error.InvalidParagraphIndex;
            if (values.paragraphs[index].field_positions != null) return error.UnsupportedStructuralFieldEdit;
        }
        for (ranges) |range| {
            if (range.section == section_index and report.markers[range.begin_marker].element_index == begin_element) break :find_field range;
        }
        return error.InvalidFieldElement;
    };
    const local: ?LocalParagraph = if (selected.structure_values == null) .{
        .sites = &selected.sites,
        .locations = selected.locations,
        .paragraph = try selected.sourceParagraph(paragraph),
    } else null;
    try validateLinkedAtParagraph(&selected.tree, field, report, ranges, frames, local);
    const segments = if (selected.structure_values) |*values| block: {
        if (selected.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        const index = paragraph - selected.first_paragraph;
        if (index >= values.paragraphs.len) return error.InvalidParagraphIndex;
        const owned = &values.paragraphs[index];
        if (owned.generated_id != null or owned.pieces != null) return error.UnsupportedFieldLabel;
        const locations = try @import("paragraph_structure_locations.zig").build(a, &selected.tree, owned);
        defer a.free(locations);
        break :block try @import("paragraph_text_positions.zig").build(a, &selected.tree, &owned.sites, locations, 1);
    } else try @import("anchor_text_positions.zig").build(a, &selected.tree, &selected.sites, selected.locations, local.?.paragraph);
    const sites = if (selected.structure_values) |*values| &values.paragraphs[paragraph - selected.first_paragraph].sites else &selected.sites;
    return .{ .field = field, .segments = segments, .sites = sites };
}

/// 조회와 입력이 공유하는 필드 종류/원문 내용/선택 소유자 정책입니다.
pub fn validateLinked(tree: *const tree_module.Tree, field: @import("field_text_ranges.zig").Range, report: *const @import("field_markers.zig").Report, ranges: []const @import("field_text_ranges.zig").Range, frames: []const @import("xml_tree_selection.zig").Frame) !void {
    return validateLinkedAtParagraph(tree, field, report, ranges, frames, null);
}

const LocalParagraph = struct {
    sites: *const @import("text_sites.zig").Sites,
    locations: []const @import("section_text.zig").Location,
    paragraph: usize,
};

fn validateLinkedAtParagraph(tree: *const tree_module.Tree, field: @import("field_text_ranges.zig").Range, report: *const @import("field_markers.zig").Report, ranges: []const @import("field_text_ranges.zig").Range, frames: []const @import("xml_tree_selection.zig").Frame, local: ?LocalParagraph) !void {
    const begin = report.markers[field.begin_marker];
    for (ranges) |other| {
        if (other.section != field.section or other.begin_marker == field.begin_marker) continue;
        if (other.content_start < field.content_end and field.content_start < other.content_end) return error.UnsupportedNestedFieldLabel;
    }
    const uri = @import("document_xml.zig").paragraph_uri;
    if (local) |owner| {
        @import("plain_paragraph_policy.zig").validateForFieldText(tree, owner.sites, owner.locations, owner.paragraph) catch |err| switch (err) {
            error.UnsupportedParagraphControl => return error.UnsupportedFieldLabelContent,
            else => return err,
        };
    } else {
        for (tree.elements, 0..) |element, index| {
            if (element.start_tag.start < field.content_start or element.start_tag.start >= field.content_end) continue;
            if (element.is(uri, "p") or element.is(uri, "run") or element.is(uri, "t") or element.is(uri, "ctrl") or element.is(uri, "linesegarray") or element.is(uri, "lineseg")) continue;
            if (@import("retained_inline_unit.zig").supported(tree, index)) continue;
            return error.UnsupportedFieldLabelContent;
        }
    }
    const kind = begin.begin.?.type_raw orelse return error.UnsupportedFieldLabel;
    if (!@import("field_text_kind.zig").supported(kind)) return error.UnsupportedFieldLabel;
    if (begin.unexpected_children != 0 or begin.sub_list_children != 0) return error.UnsupportedFieldLabel;
    _ = try @import("field_marker_ownership.zig").paragraph(tree, frames, begin.element_index);
    _ = try @import("field_marker_ownership.zig").paragraph(tree, frames, report.markers[field.end_marker].element_index);
}

/// Explicit label command, not permission to flatten arbitrary controls.
pub fn splice(self: anytype, section_index: usize, paragraph: usize, begin_element: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
    if (section_index >= self.sections.len) return error.InvalidSectionIndex;
    const active_section = &self.sections[section_index];
    if (paragraph < active_section.first_paragraph or paragraph > active_section.last_paragraph) return error.InvalidParagraphIndex;
    if (active_section.structure_values) |*values| {
        const index = paragraph - active_section.first_paragraph;
        if (index >= values.paragraphs.len) return error.InvalidParagraphIndex;
        if (values.paragraphs[index].field_positions != null) return @import("field_owned_label_session.zig").splice(self, section_index, paragraph, begin_element, start, deleted, inserted);
    }
    const prepared = try prepare(self, section_index, paragraph, begin_element);
    defer prepared.deinit(self.allocator);
    const field = prepared.field;
    const segments = prepared.segments;
    const a = self.allocator;
    const selected = &self.sections[section_index];
    var other_bytes: usize = 0;
    for (self.sections, 0..) |section, index| {
        if (index == section_index) continue;
        other_bytes += try section.textBytes(self.options.max_text_bytes -| other_bytes);
    }
    const sites = if (selected.structure_values) |*values| block: {
        if (selected.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        const index = paragraph - selected.first_paragraph;
        const owned = &values.paragraphs[index];
        for (values.paragraphs, 0..) |value, other_index| {
            if (other_index == index) continue;
            for (value.sites.items) |site| {
                if (site.text.len > self.options.max_text_bytes -| other_bytes) return error.LimitExceeded;
                other_bytes += site.text.len;
            }
        }
        break :block &owned.sites;
    } else &selected.sites;
    var dirty_index: ?usize = null;
    for (selected.field_dirty.items, 0..) |value, index| {
        if (value.element_index == begin_element) dirty_index = index;
    }
    // Prepare metadata capacity before committing strings: no fallible
    // operation may follow a successful splice.
    if (dirty_index == null) try selected.field_dirty.ensureUnusedCapacity(a, 1);
    const styled = if (selected.structure_values) |*values| &values.paragraphs[paragraph - selected.first_paragraph] else null;
    const changed = if (styled != null and styled.?.character_styles != null) block: {
        const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
        const target = try validatePreparedRange(prepared, section_index, start, end);
        break :block try @import("character_style_splice.zig").splicePositionsAtSite(a, styled.?, segments, start, deleted, inserted, self.options.max_text_bytes - other_bytes, target);
    } else try @import("field_label_splice.zig").splice(a, sites, segments, field, section_index, start, deleted, inserted, self.options.max_text_bytes - other_bytes);
    if (changed) {
        if (dirty_index) |index| selected.field_dirty.items[index].dirty = true else selected.field_dirty.appendAssumeCapacity(.{ .element_index = begin_element, .dirty = true });
    }
    return changed;
}
