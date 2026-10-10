//! Verify saved candidate before committing a native paragraph merge.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");

pub fn merge(session: *editor.Session, section_index: usize, paragraph: usize) !bool {
    return mergeMode(session, section_index, paragraph, null);
}

pub fn mergePair(session: *editor.Session, section_index: usize, paragraph: usize, right: usize) !bool {
    return mergeMode(session, section_index, paragraph, right);
}

fn mergeMode(session: *editor.Session, section_index: usize, paragraph: usize, right: ?usize) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph >= section.last_paragraph) return error.InvalidParagraphIndex;
    if (right) |selected| if (selected <= paragraph or selected > section.last_paragraph) return error.InvalidParagraphIndex;
    const a = session.allocator;
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
    const index = paragraph - section.first_paragraph;
    const right_index = if (right) |selected| selected - section.first_paragraph else index + 1;
    var candidate = if (current.paragraphs[index].field_positions != null or current.paragraphs[right_index].field_positions != null) block: {
        const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
        defer a.free(trees);
        for (session.sections, trees) |part, *tree| tree.* = part.tree;
        if (current.paragraphs[index].pieces != null or current.paragraphs[right_index].pieces != null)
            break :block try @import("field_joined_merge_values.zig").prepare(a, trees, section_index, current, index, right_index, session.options.max_xml_bytes);
        break :block try @import("field_current_merge.zig").prepare(a, trees, section_index, current, index, right_index, session.options.max_xml_bytes);
    } else block: {
        const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
        defer a.free(trees);
        for (session.sections, trees) |part, *tree| tree.* = part.tree;
        if (try @import("field_merge_session_candidate.zig").prepare(a, trees, section_index, current, index, right_index, session.options.max_xml_bytes)) |candidate| break :block candidate;
        break :block if (right) |selected| try @import("paragraph_structure_merge.zig").preparePair(a, &section.tree, current, index, selected - section.first_paragraph, session.options.max_xml_bytes) else try @import("paragraph_structure_merge.zig").prepare(a, &section.tree, current, index, session.options.max_xml_bytes);
    };
    var transferred = false;
    defer if (!transferred) candidate.deinit(a);
    const projected = try a.dupe(editor.Section, session.sections);
    defer a.free(projected);
    projected[section_index].sites = .{ .items = &.{} };
    projected[section_index].structure_values = candidate;
    projected[section_index].last_paragraph = std.math.sub(usize, section.last_paragraph, 1) catch return error.InvalidParagraphIndex;
    for (projected[section_index + 1 ..]) |*part| {
        part.first_paragraph = std.math.sub(usize, part.first_paragraph, 1) catch return error.InvalidParagraphIndex;
        part.last_paragraph = std.math.sub(usize, part.last_paragraph, 1) catch return error.InvalidParagraphIndex;
    }
    try @import("paragraph_structure_budget.zig").validate(projected, session.options);
    var proxy = session.*;
    proxy.sections = projected;
    const checked = try proxy.save();
    defer a.free(checked);
    // Commit: no allocations or fallible operations remain.
    section.sites.deinit(a);
    section.sites = .{ .items = &.{} };
    if (section.structure_values) |*values| values.deinit(a);
    section.structure_values = candidate;
    section.last_paragraph = projected[section_index].last_paragraph;
    for (session.sections[section_index + 1 ..], projected[section_index + 1 ..]) |*part, updated| {
        part.first_paragraph = updated.first_paragraph;
        part.last_paragraph = updated.last_paragraph;
    }
    transferred = true;
    return true;
}
