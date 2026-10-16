//! Publish a prepared runless current value without replacing immutable source.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");
const current = @import("runless_paragraph_current.zig");

pub fn eligible(session: *const editor.Session, section_index: usize, paragraph: usize) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    if (section.structure_values) |values| {
        const owned = &values.paragraphs[paragraph - section.first_paragraph];
        if (owned.synthesized_run_character_id != null) {
            try current.validate(&section.tree, owned);
            return true;
        }
        if (owned.sites.items.len != 0) return false;
    } else {
        for (section.locations) |location| if (location.paragraph_ordinal == try section.sourceParagraph(paragraph)) return false;
    }
    if (@import("created_table_host_splice.zig").hasPending(session)) return false;
    // No field envelope may be bypassed merely because it owns no text site.
    const uri = @import("document_xml.zig").paragraph_uri;
    for (section.tree.elements) |node| if (node.is(uri, "fieldBegin") or node.is(uri, "fieldEnd")) return false;
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    const owned = &view.paragraphs[paragraph - section.first_paragraph];
    var probe = current.prepare(session.allocator, &section.tree, owned, 0, "", session.options.max_xml_bytes) catch |err| switch (err) {
        error.UnsupportedParagraphControl, error.SourceBindingMismatch => return false,
        else => return err,
    };
    defer probe.deinit(session.allocator);
    _ = try characterId(session, owned.template_element, section_index);
    return true;
}

fn characterId(session: *const editor.Session, element: usize, section_index: usize) !u32 {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    return @import("runless_paragraph_xml.zig").characterId(a, &session.sections[section_index].tree, element, &header, resources.table(.char_shape));
}

pub fn characterShapeId(session: *const editor.Session, section_index: usize, paragraph: usize) !u32 {
    if (!try eligible(session, section_index, paragraph)) return error.MissingTextSite;
    const section = &session.sections[section_index];
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    const owned = &view.paragraphs[paragraph - section.first_paragraph];
    return owned.synthesized_run_character_id orelse try characterId(session, owned.template_element, section_index);
}

pub fn splice(session: *editor.Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8) !?bool {
    if (!try eligible(session, section_index, paragraph)) return null;
    const a = session.allocator;
    const section = &session.sections[section_index];
    const index = paragraph - section.first_paragraph;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    var other_bytes: usize = 0;
    for (session.sections, 0..) |other, ordinal| {
        if (ordinal != section_index) other_bytes += try other.textBytes(session.options.max_text_bytes -| other_bytes);
    }
    for (view.paragraphs, 0..) |row, ordinal| {
        if (ordinal == index) continue;
        for (row.sites.items) |site| {
            if (site.text.len > session.options.max_text_bytes -| other_bytes) return error.LimitExceeded;
            other_bytes += site.text.len;
        }
    }
    const limit = session.options.max_text_bytes -| other_bytes;
    var candidate: model.Values = try (model.Values{ .paragraphs = @constCast(view.paragraphs) }).clone(a);
    defer candidate.deinit(a);
    const target = &candidate.paragraphs[index];
    if (target.synthesized_run_character_id != null) {
        const changed = if (target.character_styles != null)
            try @import("character_style_splice.zig").splicePositions(a, target, &.{.{ .kind = .text, .index = 0, .source_start = target.sites.items[0].start, .start_unit = 0, .end_unit = try @import("text_site_edit.zig").utf16Length(target.sites.items[0].text) }}, start, deleted, inserted, limit)
        else
            try @import("text_site_edit.zig").splice(a, &target.sites, 0, start, deleted, inserted, limit);
        if (!changed) return false;
    } else {
        if (start != 0 or deleted != 0) return error.InvalidTextPosition;
        if (inserted.len == 0) return false;
        if (inserted.len > limit) return error.LimitExceeded;
        var prepared = try current.prepare(a, &section.tree, target, try characterId(session, target.template_element, section_index), inserted, session.options.max_xml_bytes);
        std.mem.swap(model.Paragraph, target, &prepared);
        prepared.deinit(a);
    }
    const checked = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, editor.siteOptions(session.options), section.field_dirty.items, session.options.max_xml_bytes);
    defer a.free(checked);
    if (section.structure_values) |*values| {
        std.mem.swap(model.Values, values, &candidate);
    } else {
        const empty = try a.alloc(@import("text_sites.zig").Site, 0);
        section.sites.deinit(a);
        section.sites = .{ .items = empty };
        section.structure_values = candidate;
        candidate = .{ .paragraphs = &.{} };
    }
    return true;
}
