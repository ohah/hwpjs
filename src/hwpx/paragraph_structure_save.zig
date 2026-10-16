//! Structural replacements plus ordinary current text, from immutable source.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");
const sites_mod = @import("text_sites.zig");
const save = @import("text_sites_save.zig");
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, limit: usize) ![]u8 {
    return writeInternal(a, tree, current, options, fields, limit, null, 0, null, hasOwnedColumnTabs(current), null);
}

pub fn writeWithColumnTabs(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, limit: usize) ![]u8 {
    return writeInternal(a, tree, current, options, fields, limit, null, 0, null, true, null);
}

pub fn writeWithFormulas(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    return writeInternal(a, &trees[section], current, options, fields, limit, trees, section, null, hasOwnedColumnTabs(current), null);
}

pub fn writeWithDefinitions(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, definitions: *const @import("formula_definition_values.zig").Values, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    for (current.paragraphs) |paragraph| if (paragraph.field_positions != null) {
        var report = try @import("field_markers.zig").inspect(a, trees, .{});
        defer report.deinit();
        var whole_formula = false;
        for (current.paragraphs) |owned| if (owned.field_positions) |positions| {
            if (@import("formula_marker_kind.zig").owned(&report, section, positions)) whole_formula = true;
        };
        return writeInternal(a, &trees[section], current, options, fields, limit, trees, section, definitions, hasOwnedColumnTabs(current), .{ .trees = trees, .section = section, .report = &report, .whole_formula = whole_formula });
    };
    return writeInternal(a, &trees[section], current, options, fields, limit, trees, section, definitions, hasOwnedColumnTabs(current), null);
}

const FieldContext = struct { trees: []const Tree, section: usize, report: *const @import("field_markers.zig").Report, whole_formula: bool = false };

/// Internal computed-field candidate serialization; public publication is separate.
pub fn writeWholeFormulaWithDefinitions(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, definitions: *const @import("formula_definition_values.zig").Values, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    return writeInternal(a, &trees[section], current, options, fields, limit, trees, section, definitions, hasOwnedColumnTabs(current), .{ .trees = trees, .section = section, .report = &report, .whole_formula = true });
}

/// 검증된 필드 모델 후보의 구역 XML 조립입니다. 공개 세션 게시를 허용하지 않습니다.
pub fn writeWithFieldGroups(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    return writeInternal(a, &trees[section], current, options, fields, limit, null, section, null, hasOwnedColumnTabs(current), .{ .trees = trees, .section = section, .report = &report });
}

fn hasOwnedColumnTabs(current: *const model.Values) bool {
    for (current.paragraphs) |paragraph| if (paragraph.column_boundaries != null and paragraph.pieces != null and paragraph.protected_positions != null) return true;
    return false;
}

fn writeInternal(a: std.mem.Allocator, tree: *const Tree, input: *const model.Values, options: sites_mod.Options, fields: []const save.FieldDirty, limit: usize, formula_trees: ?[]const Tree, section: usize, definitions: ?*const @import("formula_definition_values.zig").Values, column_tabs: bool, field_context: ?FieldContext) ![]u8 {
    const grouped = try @import("paragraph_page_area_order.zig").saveView(a, tree, input);
    defer if (grouped) |rows| a.free(rows);
    const grouped_values: model.Values = .{ .paragraphs = grouped orelse input.paragraphs };
    const current = &grouped_values;
    var page_index: usize = 0;
    while (page_index < current.paragraphs.len) {
        var page_end = page_index + 1;
        const row = &current.paragraphs[page_index];
        while (page_end < current.paragraphs.len and current.paragraphs[page_end].generated_id != null and current.paragraphs[page_end].template_element == row.template_element) : (page_end += 1) {}
        var distributed = false;
        for (current.paragraphs[page_index + 1 .. page_end]) |part| if (part.page_area_positions != null) {
            distributed = true;
        };
        if (distributed and row.column_boundaries != null and row.pieces != null)
            try @import("column_page_area_group_validate.zig").validate(a, tree, current.paragraphs[page_index..page_end])
        else if (distributed)
            try @import("page_area_group_validate.zig").validate(a, tree, current.paragraphs[page_index..page_end])
        else
            try @import("page_area_current_validate.zig").validateForRelocation(a, tree, row);
        page_index = page_end;
    }
    var remaining_fields: std.ArrayList(save.FieldDirty) = .empty;
    defer remaining_fields.deinit(a);
    for (fields, 0..) |field, index| {
        for (fields[0..index]) |previous| if (previous.element_index == field.element_index) return error.DuplicateFieldDirty;
        if (field.element_index >= tree.elements.len) return error.InvalidElementIndex;
        if (!tree.elements[field.element_index].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.InvalidFieldElement;
        var in_group = false;
        if (field_context != null) for (current.paragraphs) |paragraph| {
            if (paragraph.field_positions) |positions| for (positions) |position| {
                if (position.element_index == field.element_index and position.kind == .begin) in_group = true;
            };
        };
        if (!in_group) try remaining_fields.append(a, field);
    }
    for (current.paragraphs) |paragraph| if (paragraph.field_positions != null and field_context == null) return error.UnsupportedStructuralFieldEdit;
    for (current.paragraphs) |paragraph| if (paragraph.column_boundaries != null and paragraph.protected_positions != null and (!column_tabs or paragraph.pieces == null)) return error.UnsupportedColumnBoundaryEdit;
    var original = try sites_mod.collect(a, tree, options);
    defer original.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, tree, &original, options);
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var topology = try @import("paragraph_structure_collect.zig").collect(a, tree, &original, locations, options, &counters);
    defer topology.deinit(a);
    var ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer ids.deinit(a);
    var inventory = try @import("paragraph_source_inventory.zig").Cursor.init(a, topology.paragraphs.len);
    defer inventory.deinit(a);
    var text_bytes: usize = 0;
    for (current.paragraphs) |paragraph| {
        for (paragraph.sites.items) |site| {
            if (site.text.len > options.max_text_bytes -| text_bytes) return error.LimitExceeded;
            text_bytes += site.text.len;
        }
        if (paragraph.generated_id) |id| {
            if (id == 0 or (try ids.getOrPut(a, id)).found_existing) return error.DuplicateParagraphId;
            if (paragraph.pieces == null) continue;
        }
        if (paragraph.joined()) |view| {
            try view.validate();
            const first = view.pieces[0];
            if (first.template_element != paragraph.template_element or first.source_ordinal != paragraph.source_ordinal or first.generated_id != paragraph.generated_id) return error.SourceBindingMismatch;
            for (view.pieces, 0..) |piece, index| {
                var part = try view.paragraph(index);
                part.column_boundaries = paragraph.column_boundaries;
                part.column_structure_changed = paragraph.column_structure_changed;
                if (piece.generated_id) |id| {
                    // Inner continuation identity is provenance only: merged
                    // output emits no paragraph carrying this ID. Reserve
                    // uniqueness for live output paragraphs, not deleted IDs.
                    if (piece.source_ordinal != null or id == 0) return error.SourceBindingMismatch;
                    continue;
                }
                if (!piece.owns_source) return error.SourceBindingMismatch;
                if (piece.source_ordinal == null) return error.SourceBindingMismatch;
                const expected = try inventory.take(tree, &topology, piece.template_element, view.pieces[0..index]);
                try validateOriginal(tree, expected, &part);
            }
            continue;
        }
        const expected = try inventory.take(tree, &topology, paragraph.template_element, &.{});
        try validateOriginal(tree, expected, &paragraph);
    }
    try inventory.finish();
    const flat = try a.dupe(sites_mod.Site, original.items);
    defer a.free(flat);
    const SiteKey = struct { element: usize, start: usize };
    var site_indices: std.AutoHashMapUnmanaged(SiteKey, usize) = .empty;
    defer site_indices.deinit(a);
    for (flat, 0..) |site, index| {
        const entry = try site_indices.getOrPut(a, .{ .element = site.element_index, .start = site.start });
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.serialized_xml.?);
        changes.deinit(a);
    }
    var i: usize = 0;
    var previous_original: ?usize = null;
    var covered_end: usize = 0;
    while (i < current.paragraphs.len) {
        const paragraph = &current.paragraphs[i];
        if (paragraph.template_element < tree.elements.len) {
            const node = tree.elements[paragraph.template_element];
            var already_composed = false;
            for (changes.items) |change| if (change.serialized_xml != null and change.start < node.start_tag.start and node.end <= change.end) {
                already_composed = true;
            };
            if (already_composed) {
                i += 1;
                continue;
            }
        }
        if (paragraph.template_element < tree.elements.len and tree.elements[paragraph.template_element].start_tag.start < covered_end) {
            i += 1;
            continue;
        }
        if (paragraph.source_ordinal == null or paragraph.generated_id != null or paragraph.template_element >= tree.elements.len) return error.SourceBindingMismatch;
        if (previous_original) |before| if (paragraph.template_element <= before) return error.SourceBindingMismatch;
        previous_original = paragraph.template_element;
        if (paragraph.synthesized_run_character_id != null) {
            const node = tree.elements[paragraph.template_element];
            const replacement = try @import("runless_paragraph_current.zig").write(a, tree, paragraph, limit);
            errdefer a.free(replacement);
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            i += 1;
            continue;
        }
        var end = i + 1;
        while (end < current.paragraphs.len and current.paragraphs[end].source_ordinal == null) : (end += 1) {
            const generated = &current.paragraphs[end];
            if (generated.template_element != paragraph.template_element or generated.generated_id == null) return error.SourceBindingMismatch;
        }
        var distributed_page_areas = false;
        if (paragraph.page_area_positions != null and paragraph.column_boundaries != null and paragraph.pieces != null) {
            const replacement = if (end == i + 1) try @import("column_page_area_joined_xml.zig").writeCurrent(a, tree, paragraph, current, &topology, options, limit) else try @import("page_area_group_xml.zig").writeCurrentWithColumnPageAreas(a, tree, current.paragraphs[i..end], current, &topology, options, limit);
            errdefer a.free(replacement);
            const node = tree.elements[paragraph.template_element];
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            try appendJoinedRemovals(a, tree, &paragraph.joined().?, paragraph.template_element, &changes, formula_trees != null);
            covered_end = node.end;
            i = end;
            continue;
        }
        for (current.paragraphs[i + 1 .. end]) |part| if (part.page_area_positions != null) {
            distributed_page_areas = true;
        };
        if (distributed_page_areas) {
            const replacement = try @import("page_area_group_xml.zig").writeCurrent(a, tree, current.paragraphs[i..end], current, &topology, options, limit);
            errdefer a.free(replacement);
            const node = tree.elements[paragraph.template_element];
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            covered_end = node.end;
            i = end;
            continue;
        }
        var field_group = false;
        for (current.paragraphs[i..end]) |part| if (part.field_positions != null) {
            field_group = true;
        };
        if (field_group) {
            const context = field_context orelse return error.UnsupportedStructuralFieldEdit;
            if (paragraph.pieces != null) {
                const replacement = try @import("field_joined_group_xml.zig").write(a, context.trees, context.section, current.paragraphs[i..end], context.report, fields, limit);
                errdefer a.free(replacement);
                const node = tree.elements[paragraph.template_element];
                try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
                try appendJoinedRemovals(a, tree, &paragraph.joined().?, paragraph.template_element, &changes, formula_trees != null);
                covered_end = node.end;
                i = end;
                continue;
            }
            const replacement = if (context.whole_formula)
                try @import("field_group_xml.zig").writeWholeFormulaDirty(a, context.trees, context.section, current.paragraphs[i..end], context.report, options, fields, limit, 200_000)
            else
                try @import("field_group_xml.zig").writeDirty(a, context.trees, context.section, current.paragraphs[i..end], context.report, options, fields, limit, 200_000);
            errdefer a.free(replacement);
            const node = tree.elements[paragraph.template_element];
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            covered_end = node.end;
            i = end;
            continue;
        }
        var column_group = false;
        for (current.paragraphs[i..end]) |part| if (part.column_boundaries != null) {
            column_group = true;
        };
        const column_anchors = column_group and paragraph.protected_positions != null and paragraph.pieces != null and @import("paragraph_joined_anchor_mode.zig").has(tree, &paragraph.joined().?);
        if (column_group) {
            if (paragraph.joined()) |view| {
                if (column_anchors) {
                    try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, current.paragraphs[i..end]);
                } else if (column_tabs and paragraph.protected_positions != null)
                    try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, current.paragraphs[i..end])
                else if (end != i + 1)
                    try @import("column_boundary_joined_group.zig").validate(a, tree, current.paragraphs[i..end])
                else if (column_tabs and paragraph.character_styles == null)
                    try @import("column_boundary_joined_partition.zig").validateWithTabs(a, tree, &view, paragraph.column_boundaries.?)
                else
                    try @import("column_boundary_joined_partition.zig").validate(a, tree, &view, paragraph.column_boundaries.?);
            } else try @import("column_boundary_partition.zig").validate(a, tree, current.paragraphs[i..end]);
        }
        if (column_group and ((column_anchors and end != i + 1) or (!column_anchors and (end != i + 1 or (column_tabs and paragraph.protected_positions != null))))) {
            if (paragraph.joined()) |view| try appendJoinedRemovals(a, tree, &view, paragraph.template_element, &changes, formula_trees != null);
            const replacement = if (column_anchors) try @import("column_boundary_group_xml.zig").writeWithAnchors(a, tree, current.paragraphs[i..end], options, limit, current, &topology) else if (column_tabs and paragraph.protected_positions != null) try @import("column_boundary_group_xml.zig").writeWithTabs(a, tree, current.paragraphs[i..end], options, limit) else try @import("column_boundary_group_xml.zig").write(a, tree, current.paragraphs[i..end], options, limit);
            errdefer a.free(replacement);
            const node = tree.elements[paragraph.template_element];
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            covered_end = node.end;
            i = end;
            continue;
        }
        var protected_group = false;
        for (current.paragraphs[i..end]) |part| if (part.protected_positions != null) {
            protected_group = true;
        };
        if (protected_group) {
            if (paragraph.pieces != null) {
                const view = paragraph.joined().?;
                if (@import("paragraph_joined_anchor_mode.zig").has(tree, &view))
                    try @import("paragraph_joined_tab_group.zig").validateWithAnchors(a, tree, current.paragraphs[i..end])
                else
                    try @import("paragraph_joined_tab_group.zig").validate(a, tree, current.paragraphs[i..end]);
            } else try @import("paragraph_protected_partition.zig").validate(a, tree, current.paragraphs[i..end]);
        }
        if (!protected_group and paragraph.pieces == null and paragraph.character_styles == null and end == i + 1 and !try @import("page_area_current_xml.zig").requiresRelocation(a, tree, paragraph) and !try @import("column_boundary_current_xml.zig").requiresRelocation(a, tree, paragraph)) {
            if (paragraph.paragraph_shape_id) |id| {
                const opening = try @import("paragraph_format_write.zig").write(a, tree, paragraph.template_element, id, limit);
                errdefer a.free(opening);
                const span = tree.elements[paragraph.template_element].start_tag;
                try changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .serialized_xml = opening });
            }
            for (paragraph.sites.items) |site| {
                const index = site_indices.get(.{ .element = site.element_index, .start = site.start }) orelse return error.InvalidTextSites;
                flat[index] = site;
            }
        } else {
            var bytes: std.ArrayList(u8) = .empty;
            defer bytes.deinit(a);
            for (current.paragraphs[i..end]) |*part| {
                if (part.joined()) |view| {
                    try appendJoinedRemovals(a, tree, &view, paragraph.template_element, &changes, formula_trees != null);
                }
                const xml = if (part.page_area_positions != null)
                    try @import("page_area_current_xml.zig").write(a, tree, part, options, limit -| bytes.items.len)
                else if (column_anchors)
                    try @import("column_boundary_joined_xml.zig").writeWithAnchors(a, tree, part, options, limit -| bytes.items.len)
                else if (column_tabs and part.character_styles == null and part.column_boundaries != null and part.pieces != null)
                    try @import("column_boundary_joined_xml.zig").writeWithTabs(a, tree, part, options, limit -| bytes.items.len)
                else if (part.column_boundaries != null and part.pieces != null)
                    try @import("column_boundary_joined_xml.zig").write(a, tree, part, options, limit -| bytes.items.len)
                else if (part.column_boundaries != null)
                    try @import("column_boundary_current_xml.zig").write(a, tree, part, options, limit -| bytes.items.len)
                else if (part.protected_positions != null and part.pieces != null)
                    (if (@import("paragraph_joined_anchor_mode.zig").has(tree, &part.joined().?)) try @import("paragraph_joined_xml.zig").writeOwnedAnchors(a, tree, &part.joined().?, options, limit -| bytes.items.len, part.protected_positions.?) else try @import("paragraph_joined_xml.zig").writeOwnedTabs(a, tree, &part.joined().?, options, limit -| bytes.items.len, part.protected_positions.?))
                else if (part.protected_positions != null and part.character_styles != null)
                    try @import("character_style_paragraph_xml.zig").write(a, tree, part, limit -| bytes.items.len)
                else if (part.protected_positions != null)
                    try @import("paragraph_split_xml.zig").writeProtected(a, tree, part, options, limit -| bytes.items.len)
                else if (part.character_styles != null and part.pieces == null)
                    try @import("character_style_paragraph_xml.zig").write(a, tree, part, limit -| bytes.items.len)
                else if (part.joined()) |view|
                    try @import("paragraph_joined_xml.zig").write(a, tree, &view, options, limit -| bytes.items.len)
                else if (part.title_positions != null)
                    try @import("paragraph_split_xml.zig").writeCurrentTitles(a, tree, part, options, limit -| bytes.items.len)
                else
                    try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, tree, part.template_element, &part.sites, options, part.generated_id != null, part.generated_id orelse 0, limit -| bytes.items.len);
                defer a.free(xml);
                if (xml.len > limit -| bytes.items.len) return error.LimitExceeded;
                const formatted = if (part.paragraph_shape_id) |id| try @import("paragraph_format_write.zig").writeCurrent(a, tree, part.template_element, xml, id, limit -| bytes.items.len) else null;
                defer if (formatted) |value| a.free(value);
                const nested_writer = @import("paragraph_nested_save.zig");
                const nested = if (part.joined()) |view|
                    (if (@import("paragraph_joined_anchor_mode.zig").has(tree, &view))
                        (if (part.protected_positions) |owned|
                            try nested_writer.foldOwnedJoined(a, tree, current, &topology, &view, owned, formatted orelse xml, limit -| bytes.items.len)
                        else
                            try nested_writer.foldJoined(a, tree, current, &topology, &view, formatted orelse xml, limit -| bytes.items.len))
                    else
                        try nested_writer.fold(a, tree, current, &topology, part.template_element, formatted orelse xml, limit -| bytes.items.len))
                else if (part.generated_id != null and part.protected_positions == null and part.column_boundaries == null)
                    try nested_writer.foldContinuation(a, tree, current, &topology, part.template_element, formatted orelse xml, limit -| bytes.items.len)
                else
                    try nested_writer.fold(a, tree, current, &topology, part.template_element, formatted orelse xml, limit -| bytes.items.len);
                defer a.free(nested);
                try bytes.appendSlice(a, nested);
            }
            const node = tree.elements[paragraph.template_element];
            const replacement = try bytes.toOwnedSlice(a);
            errdefer a.free(replacement);
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement });
            covered_end = node.end;
        }
        i = end;
    }
    const projected: sites_mod.Sites = .{ .items = flat };
    if (formula_trees) |trees| {
        if (try @import("formula_section_save.zig").hasFormula(a, tree)) {
            const composed = try save.writeWithChanges(a, tree, &projected, options, remaining_fields.items, changes.items, limit);
            defer a.free(composed);
            return @import("paragraph_formula_save.zig").writeWithDefinitions(a, trees, section, composed, options, definitions, limit);
        }
    }
    return save.writeWithChanges(a, tree, &projected, options, remaining_fields.items, changes.items, limit);
}

fn appendJoinedRemovals(a: std.mem.Allocator, tree: *const Tree, view: *const @import("paragraph_joined_values.zig").Joined, owner: usize, changes: *std.ArrayList(writer.Change), formulas_available: bool) !void {
    if (!formulas_available and try @import("formula_section_save.zig").hasFormula(a, tree)) return error.UnsupportedJoinedFormulaSave;
    for (view.pieces) |piece| {
        if (!piece.owns_source or piece.generated_id != null or piece.template_element == owner) continue;
        if (piece.template_element >= tree.elements.len) return error.SourceBindingMismatch;
        const removed = tree.elements[piece.template_element];
        try changes.append(a, .{ .start = removed.start_tag.start, .end = removed.end, .text = "", .serialized_xml = &.{} });
    }
}

fn validateOriginal(tree: *const Tree, expected: *const model.Paragraph, paragraph: *const model.Paragraph) !void {
    if (paragraph.template_element != expected.template_element) return error.SourceBindingMismatch;
    if (paragraph.synthesized_run_character_id != null) {
        if (expected.sites.items.len != 0 or paragraph.source_ordinal != expected.source_ordinal) return error.SourceBindingMismatch;
        return @import("runless_paragraph_current.zig").validate(tree, paragraph);
    }
    var extra: usize = 0;
    for (paragraph.sites.items, 0..) |site, index| {
        var found = false;
        for (expected.sites.items) |before| if (before.element_index == site.element_index and before.start == site.start) {
            found = true;
            break;
        };
        if (found) continue;
        if (!paragraph.column_structure_changed or paragraph.column_boundaries == null or !@import("continuation_empty_run.zig").valid(tree, paragraph.template_element, site)) return error.SourceBindingMismatch;
        for (paragraph.sites.items[0..index]) |before| if (before.element_index == site.element_index and before.start == site.start) return error.SourceBindingMismatch;
        extra += 1;
    }
    if (paragraph.sites.items.len != expected.sites.items.len + extra) return error.SourceBindingMismatch;
    for (expected.sites.items) |before| {
        var match: ?sites_mod.Site = null;
        for (paragraph.sites.items) |site| if (site.element_index == before.element_index and site.start == before.start) {
            if (match != null) return error.SourceBindingMismatch;
            match = site;
        };
        const after = match orelse return error.SourceBindingMismatch;
        if (before.end != after.end or before.empty_element != after.empty_element or before.missing_text != after.missing_text or before.anchor_boundary != after.anchor_boundary) return error.SourceBindingMismatch;
    }
}

test "HWPX structure save preserves non-target values and repeated splits atomically" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><!--keep--><p:p id='1'><p:run><p:t>A😀B</p:t></p:run></p:p><p:p id='9'><p:run><p:t>other</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var initial = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer initial.deinit(a);
    const edited = &initial.paragraphs[1].sites.items[0];
    a.free(edited.text);
    edited.text = try a.dupe(u8, "현재<&");
    var first = try @import("paragraph_structure_split.zig").prepare(a, &tree, &initial, 0, 1, 1, 2, 10000);
    defer first.deinit(a);
    var current = try @import("paragraph_structure_split.zig").prepare(a, &tree, &first, 1, 2, 2, 3, 10000);
    defer current.deinit(a);
    const output = try write(a, &tree, &current, .{}, &.{}, 10000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var values = try sites_mod.collect(a, &reopened, .{});
    defer values.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), values.items.len);
    for (values.items, [_][]const u8{ "A", "😀", "B", "현재<&" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    try std.testing.expect(std.mem.indexOf(u8, output, "<!--keep-->") != null);
    try std.testing.expectEqualStrings(source, tree.source);
    const missing: model.Values = .{ .paragraphs = current.paragraphs[0 .. current.paragraphs.len - 1] };
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, &missing, .{}, &.{}, 10000));
    const previous_id = current.paragraphs[2].generated_id;
    current.paragraphs[2].generated_id = current.paragraphs[1].generated_id;
    try std.testing.expectError(error.DuplicateParagraphId, write(a, &tree, &current, .{}, &.{}, 10000));
    current.paragraphs[2].generated_id = previous_id;
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, &current, .{}, &.{}, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree, borrowed_values: *const model.Values) !void {
            const result = try write(allocator, borrowed, borrowed_values, .{}, &.{}, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &current });
}
