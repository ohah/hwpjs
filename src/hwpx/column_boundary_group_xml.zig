//! Assemble a validated split group's text and column controls from current values.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const sites_mod = @import("text_sites.zig");
const moves = @import("column_boundary_moves_xml.zig");
const Nested = struct { current: *const @import("paragraph_structure_values.zig").Values, original: *const @import("paragraph_structure_values.zig").Values };

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, options: sites_mod.Options, limit: usize) ![]u8 {
    return writeMode(a, tree, paragraphs, options, limit, false, null);
}

pub fn writeWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, options: sites_mod.Options, limit: usize) ![]u8 {
    return writeMode(a, tree, paragraphs, options, limit, true, null);
}

pub fn writeWithAnchors(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, options: sites_mod.Options, limit: usize, current: *const @import("paragraph_structure_values.zig").Values, original: *const @import("paragraph_structure_values.zig").Values) ![]u8 {
    return writeMode(a, tree, paragraphs, options, limit, true, .{ .current = current, .original = original });
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, options: sites_mod.Options, limit: usize, allow_tabs: bool, nested: ?Nested) ![]u8 {
    const anchors = nested != null;
    if (paragraphs.len == 0 or (!allow_tabs and paragraphs.len < 2)) return error.InvalidColumnBoundaryGroup;
    const first = paragraphs[0];
    if (first.generated_id != null or first.source_ordinal == null) return error.SourceBindingMismatch;
    const joined = first.joined();
    if (anchors)
        try @import("column_boundary_joined_group.zig").validateWithAnchors(a, tree, paragraphs)
    else if (allow_tabs)
        try @import("column_boundary_joined_group.zig").validateWithTabs(a, tree, paragraphs)
    else if (joined != null)
        try @import("column_boundary_joined_group.zig").validate(a, tree, paragraphs)
    else
        try @import("column_boundary_partition.zig").validate(a, tree, paragraphs);
    var base: std.ArrayList(u8) = .empty;
    defer base.deinit(a);
    for (paragraphs, 0..) |paragraph, index| {
        if (!allow_tabs and paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
        if (index != 0 and (paragraph.generated_id == null or paragraph.source_ordinal != null)) return error.SourceBindingMismatch;
        const xml = if (allow_tabs) block: {
            const view = paragraph.joined() orelse return error.MissingJoinedParagraph;
            if (anchors) break :block try @import("paragraph_joined_xml.zig").writeOwnedColumnAnchors(a, tree, &view, options, limit -| base.items.len, paragraph.protected_positions orelse return error.SourceBindingMismatch);
            break :block try @import("paragraph_joined_xml.zig").writeOwnedColumnTabs(a, tree, &view, options, limit -| base.items.len, paragraph.protected_positions orelse return error.SourceBindingMismatch);
        } else if (joined != null)
            try @import("column_boundary_joined_xml.zig").writeBase(a, tree, &paragraph, options, limit -| base.items.len)
        else if (paragraph.character_styles != null)
            try writeStyled(a, tree, &paragraph, limit -| base.items.len)
        else if (index == 0 and paragraph.column_structure_changed)
            try @import("paragraph_split_xml.zig").writeColumnStructure(a, tree, paragraph.template_element, &paragraph.sites, options, limit -| base.items.len)
        else if (paragraph.title_positions != null)
            try @import("paragraph_split_xml.zig").writeCurrentTitles(a, tree, &paragraph, options, limit -| base.items.len)
        else
            try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, tree, paragraph.template_element, &paragraph.sites, options, index != 0, paragraph.generated_id orelse 0, limit -| base.items.len);
        defer a.free(xml);
        const formatted = if (paragraph.paragraph_shape_id) |id| try @import("paragraph_format_write.zig").writeCurrent(a, tree, paragraph.template_element, xml, id, limit -| base.items.len) else null;
        defer if (formatted) |bytes| a.free(bytes);
        const composed = if (nested) |context| try @import("paragraph_nested_save.zig").foldOwnedJoined(a, tree, context.current, context.original, &paragraph.joined().?, paragraph.protected_positions.?, formatted orelse xml, limit -| base.items.len) else null;
        defer if (composed) |bytes| a.free(bytes);
        const bytes = composed orelse formatted orelse xml;
        if (bytes.len > limit -| base.items.len) return error.LimitExceeded;
        try base.appendSlice(a, bytes);
    }
    const node = tree.elements[first.template_element];
    const temporary_limit = std.math.add(usize, tree.source.len, limit) catch return error.LimitExceeded;
    const source = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = base.items }}, temporary_limit);
    defer a.free(source);
    const original = if (anchors)
        try @import("column_boundary_joined_collect.zig").collectWithAnchors(a, tree, &joined.?, tree.elements.len)
    else if (allow_tabs)
        try @import("column_boundary_joined_collect.zig").collectWithTabs(a, tree, &joined.?, tree.elements.len)
    else if (joined) |view|
        try @import("column_boundary_joined_collect.zig").collect(a, tree, &view, tree.elements.len)
    else
        try @import("column_boundary_collect.zig").collect(a, tree, first.template_element, &.{}, .right, tree.elements.len);
    defer a.free(original);
    const inventory_order = try @import("column_boundary_inventory_order.zig").prepare(a, tree, joined, original);
    defer a.free(inventory_order.items);
    var inserted: ?[]u8 = null;
    defer if (inserted) |bytes| a.free(bytes);
    var rendered = try @import("xml_part_tree.zig").parse(a, source, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer rendered.deinit(a);
    if (inventory_order.visible != inventory_order.items.len) {
        var last_run: ?usize = null;
        var child = rendered.elements[first.template_element].first_child;
        while (child) |index| : (child = rendered.elements[index].next_sibling) {
            const element = rendered.elements[index];
            if (element.is(@import("document_xml.zig").paragraph_uri, "run") and element.end_tag != null) last_run = index;
        }
        var controls_xml: std.ArrayList(u8) = .empty;
        defer controls_xml.deinit(a);
        for (inventory_order.items[inventory_order.visible..]) |boundary| {
            const source_control = try @import("column_boundary_xml.zig").control(tree, boundary.source_element);
            const source_run = tree.elements[source_control].parent.?;
            const source_owner = tree.elements[source_run].parent.?;
            var retained = false;
            for (paragraphs[1..]) |paragraph| if (paragraph.pieces) |pieces| for (pieces) |piece| {
                if (piece.template_element == source_owner and piece.output == .source_runs) {
                    for (paragraph.column_boundaries orelse return error.MissingColumnBoundaries) |owned| {
                        if (owned.source_element == boundary.source_element) retained = true;
                    }
                }
            };
            if (retained) continue;
            const control = try @import("column_boundary_xml.zig").write(a, tree, boundary, temporary_limit -| controls_xml.items.len);
            defer a.free(control);
            try controls_xml.appendSlice(a, control);
        }
        if (controls_xml.items.len != 0) {
            const run = last_run orelse return error.UnsupportedColumnBoundaryTarget;
            const at = rendered.elements[run].end_tag.?.start;
            inserted = try @import("xml_source_writer.zig").write(a, rendered.source, &.{.{ .start = at, .end = at, .text = "", .serialized_xml = controls_xml.items }}, temporary_limit);
            const next = try @import("xml_part_tree.zig").parse(a, inserted.?, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
            rendered.deinit(a);
            rendered = next;
        }
    }
    const owners = try a.alloc(usize, paragraphs.len);
    defer a.free(owners);
    owners[0] = first.template_element;
    for (owners[1..], 1..) |*owner, index| {
        owner.* = rendered.elements[owners[index - 1]].next_sibling orelse return error.SourceBindingMismatch;
        if (!rendered.elements[owner.*].is(@import("document_xml.zig").paragraph_uri, "p")) return error.SourceBindingMismatch;
    }
    var controls: std.ArrayList(@import("column_boundary_position.zig").Position) = .empty;
    defer controls.deinit(a);
    for (owners) |owner| {
        const local = try @import("column_boundary_collect.zig").collect(a, &rendered, owner, &.{}, .right, rendered.elements.len);
        defer a.free(local);
        try controls.appendSlice(a, local);
    }
    if (original.len != controls.items.len) return error.SourceBindingMismatch;
    var mapping: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer mapping.deinit(a);
    for (inventory_order.items, controls.items) |before, after| {
        if (!std.mem.eql(u8, tree.sourceOf(before.source_element), rendered.sourceOf(after.source_element))) return error.SourceBindingMismatch;
        try mapping.put(a, before.source_element, after.source_element);
    }
    var current_options = options;
    if (allow_tabs) current_options.materialize_tab_boundaries = true;
    if (anchors) current_options.materialize_anchor_boundaries = true;
    var sites = try sites_mod.collect(a, &rendered, current_options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &rendered, &sites, current_options);
    defer a.free(locations);
    var ordinals: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer ordinals.deinit(a);
    for (sites.items, locations) |site, location| {
        const run = if (site.missing_text) site.element_index else rendered.elements[site.element_index].parent orelse continue;
        if (rendered.elements[run].parent) |owner| try ordinals.put(a, owner, location.paragraph_ordinal);
    }
    var requests: std.ArrayList(moves.Request) = .empty;
    defer requests.deinit(a);
    var current_units: std.AutoHashMapUnmanaged(usize, u32) = .empty;
    defer current_units.deinit(a);
    var current_owners: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer current_owners.deinit(a);
    for (owners) |owner| {
        const ordinal = ordinals.get(owner) orelse return error.MissingTextSite;
        const positions = try @import("anchor_text_positions.zig").build(a, &rendered, &sites, locations, ordinal);
        defer a.free(positions);
        const local = try @import("column_boundary_collect.zig").collect(a, &rendered, owner, positions, .right, controls.items.len);
        defer a.free(local);
        for (local) |boundary| {
            try current_units.put(a, boundary.source_element, boundary.unit);
            try current_owners.put(a, boundary.source_element, owner);
        }
    }
    for (paragraphs, owners) |paragraph, owner| {
        const ordinal = ordinals.get(owner) orelse return error.MissingTextSite;
        for (paragraph.column_boundaries.?) |boundary| {
            var current = boundary;
            current.source_element = mapping.get(boundary.source_element) orelse return error.SourceBindingMismatch;
            if ((current_owners.get(current.source_element) orelse return error.SourceBindingMismatch) == owner and (current_units.get(current.source_element) orelse return error.SourceBindingMismatch) == current.unit) continue;
            try requests.append(a, .{ .paragraph = ordinal, .boundary = current });
        }
    }
    const output = try moves.writeGroupSources(a, &rendered, &sites, locations, owners, requests.items, temporary_limit);
    defer a.free(output);
    // Patches can change byte lengths, so resolve the final sibling range again.
    var final_tree = try @import("xml_part_tree.zig").parse(a, output, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer final_tree.deinit(a);
    var last = first.template_element;
    for (1..paragraphs.len) |_| last = final_tree.elements[last].next_sibling orelse return error.SourceBindingMismatch;
    const result = final_tree.source[final_tree.elements[first.template_element].start_tag.start..final_tree.elements[last].end];
    if (result.len > limit) return error.LimitExceeded;
    return a.dupe(u8, result);
}

fn writeStyled(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, limit: usize) ![]u8 {
    var source = paragraph.*;
    source.generated_id = null;
    const xml = try @import("character_style_paragraph_xml.zig").write(a, tree, &source, limit);
    if (paragraph.generated_id) |id| {
        defer a.free(xml);
        return @import("styled_continuation_xml.zig").paragraph(a, tree, xml, id, limit);
    }
    return xml;
}
