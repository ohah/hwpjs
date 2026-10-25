//! Prepare and verify the whole saved document before ownership transfer.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");

pub fn split(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
    return splitMode(session, section_index, paragraph, start, deleted, false, true, null);
}

pub fn splitWithBreak(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, intent: @import("../model/paragraph_break.zig").Kind) !bool {
    return splitMode(session, section_index, paragraph, start, deleted, false, true, intent);
}

pub fn splitAnchored(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
    return splitMode(session, section_index, paragraph, start, deleted, true, true, null);
}

pub fn canSplit(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32) !bool {
    return splitMode(session, section_index, paragraph, start, deleted, false, false, null) catch |err| switch (err) {
        error.ProtectedFieldRange, error.UnsupportedStructuralFieldEdit, error.UnsupportedFormulaCellParagraphs, error.UnsupportedParagraphControl, error.UnsupportedInlineControl => false,
        else => return err,
    };
}

fn splitMode(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, anchored: bool, publish: bool, intent: ?@import("../model/paragraph_break.zig").Kind) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    var collected: ?model.Values = null;
    defer if (collected) |*values| values.deinit(a);
    const current = if (section.structure_values) |*values| block: {
        if (section.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
        break :block values;
    } else block: {
        var report: @import("section_text.zig").Report = .{ .paragraphs = (section.source_first_paragraph orelse section.first_paragraph) - 1 };
        collected = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &report);
        break :block &collected.?;
    };
    var column_current: ?model.Values = null;
    defer if (column_current) |*values| values.deinit(a);
    const selected_index = paragraph - section.first_paragraph;
    const selected = &current.paragraphs[selected_index];
    if (intent != null) {
        if (selected.template_element >= section.tree.elements.len) return error.SourceBindingMismatch;
        const owner = section.tree.elements[selected.template_element].parent orelse return error.UnsupportedParagraphBreakOwner;
        if (owner >= selected.template_element) return error.SourceBindingMismatch;
        if (!section.tree.elements[owner].is(@import("document_xml.zig").section_uri, "sec")) return error.UnsupportedParagraphBreakOwner;
        if (section.dutmal_texts.entries.items.len != 0) return error.UnsupportedDutmalStructuralSave;
    }
    // Protected splits retain their existing anchor-ownership path until column
    // ownership can be partitioned together with protected positions.
    if (!anchored and !try @import("field_split_session_candidate.zig").hasSourceField(&section.tree, selected.template_element) and selected.column_boundaries == null and selected.generated_id == null and selected.source_ordinal != null and selected.protected_positions == null and selected.pieces == null and selected.character_styles == null) {
        const identities = try @import("column_boundary_collect.zig").collect(a, &section.tree, selected.template_element, &.{}, .right, session.options.max_sites);
        defer a.free(identities);
        if (identities.len != 0) {
            column_current = try current.clone(a);
            try @import("column_boundary_materialize.zig").install(a, &section.tree, &column_current.?.paragraphs[selected_index], session.options.max_sites);
        }
    }
    const column_values = if (column_current) |*values| values else current;
    var page_current: ?model.Values = null;
    defer if (page_current) |*values| values.deinit(a);
    const page_source = &column_values.paragraphs[selected_index];
    if (page_source.page_area_positions == null and page_source.generated_id == null and page_source.source_ordinal != null and page_source.column_boundaries == null and page_source.protected_positions == null and page_source.pieces == null and page_source.character_styles == null and page_source.field_positions == null and !try @import("field_split_session_candidate.zig").hasSourceField(&section.tree, page_source.template_element) and @import("page_area_source_positions.zig").hasForParagraph(&section.tree, page_source.template_element)) {
        page_current = try column_values.clone(a);
        try @import("page_area_materialize.zig").install(a, &section.tree, &page_current.?.paragraphs[selected_index], session.options.max_sites);
        var interior = false;
        for (page_current.?.paragraphs[selected_index].page_area_positions.?) |area| {
            if (area.unit != 0) interior = true;
        }
        // 0경계 선언은 기존 보존 경로로도 왼쪽 귀속이 유지됩니다.
        if (!interior) {
            page_current.?.deinit(a);
            page_current = null;
        }
    }
    const split_current = if (page_current) |*values| values else column_values;
    var remaining_xml = session.options.max_xml_bytes;
    for (session.sections) |part| {
        if (part.tree.source.len > remaining_xml) return error.LimitExceeded;
        remaining_xml -= part.tree.source.len;
    }
    const extras = try @import("paragraph_id_source_parts.zig").read(a, session.source, remaining_xml);
    defer {
        for (extras) |*tree| tree.deinit(a);
        a.free(extras);
    }
    const tree_count = std.math.add(usize, session.sections.len, extras.len) catch return error.LimitExceeded;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, tree_count);
    defer a.free(trees);
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    for (session.sections, trees[0..session.sections.len]) |part, *tree| {
        tree.* = part.tree;
        if (part.structure_values) |values| for (values.paragraphs) |owned| {
            if (owned.generated_id) |id| try ids.append(a, id);
        };
    }
    @memcpy(trees[session.sections.len..], extras);
    const id = try @import("paragraph_instance_ids.zig").next(a, trees, ids.items, session.options.max_sites);
    var candidate = (try @import("formula_split_session_candidate.zig").prepare(session, trees[0..session.sections.len], section_index, split_current, selected_index, paragraph, start, end, id)) orelse (try @import("field_split_session_candidate.zig").prepare(a, trees[0..session.sections.len], section_index, split_current, selected_index, start, end, id, session.options.max_xml_bytes, 200_000)) orelse if (anchored) try @import("paragraph_structure_split.zig").prepareAnchored(a, &section.tree, split_current, selected_index, start, end, id, session.options.max_xml_bytes) else try @import("paragraph_structure_split.zig").prepare(a, &section.tree, split_current, selected_index, start, end, id, session.options.max_xml_bytes);
    var transferred = false;
    defer if (!transferred) candidate.deinit(a);
    // Nested bodies can precede the new sibling in the flat paragraph view.
    // Bind the result by its freshly allocated identity, not by adjacency.
    var right_index: ?usize = null;
    for (candidate.paragraphs, 0..) |row, ordinal| if (row.generated_id == id) {
        if (right_index != null or ordinal <= selected_index) return error.SourceBindingMismatch;
        right_index = ordinal;
    };
    const split_right = right_index orelse return error.SourceBindingMismatch;
    if (!anchored and @import("empty_continuation_style.zig").eligible(selected, &candidate.paragraphs[split_right], start, end)) {
        const resource_ids = try @import("character_style_resources.zig").ids(session);
        defer a.free(resource_ids);
        try @import("empty_continuation_style.zig").apply(a, &section.tree, selected, &candidate.paragraphs[split_right], start, end, resource_ids, session.options.max_sites);
    }
    candidate.paragraphs[selected_index].break_before = selected.break_before;
    candidate.paragraphs[split_right].break_before = intent;
    var dirty: ?std.ArrayList(@import("text_sites_save.zig").FieldDirty) = null;
    defer if (!transferred) {
        if (dirty) |*values| values.deinit(a);
    };
    if (deleted != 0 and candidate.paragraphs[selected_index].field_positions != null) dirty = try @import("field_split_dirty.zig").prepare(a, trees[0..session.sections.len], section_index, current, selected_index, start, end, section.field_dirty.items);
    const projected = try a.dupe(editor.Section, session.sections);
    defer a.free(projected);
    projected[section_index].sites = .{ .items = &.{} };
    projected[section_index].structure_values = candidate;
    if (dirty) |values| projected[section_index].field_dirty = values;
    projected[section_index].last_paragraph = std.math.add(usize, section.last_paragraph, 1) catch return error.LimitExceeded;
    for (projected[section_index + 1 ..]) |*part| {
        part.first_paragraph = std.math.add(usize, part.first_paragraph, 1) catch return error.LimitExceeded;
        part.last_paragraph = std.math.add(usize, part.last_paragraph, 1) catch return error.LimitExceeded;
    }
    try @import("paragraph_structure_budget.zig").validate(projected, session.options);
    var proxy = session.*;
    proxy.sections = projected;
    const checked_zip = try proxy.save();
    defer a.free(checked_zip);
    if (!publish) return true;
    // No allocation or fallible operation follows this commit boundary.
    section.sites.deinit(a);
    section.sites = .{ .items = &.{} };
    if (section.structure_values) |*values| values.deinit(a);
    section.structure_values = candidate;
    if (dirty) |values| {
        section.field_dirty.deinit(a);
        section.field_dirty = values;
    }
    section.last_paragraph = projected[section_index].last_paragraph;
    for (session.sections[section_index + 1 ..], projected[section_index + 1 ..]) |*part, updated| {
        part.first_paragraph = updated.first_paragraph;
        part.last_paragraph = updated.last_paragraph;
    }
    transferred = true;
    return true;
}
