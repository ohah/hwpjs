//! Snapshot of existing Native query wires, not a document cache/model.
const std = @import("std");
const Session = @import("../hwpx/editor_session.zig").Session;
const Q = @import("render_hwpx_queries.zig");
const Entry = struct { name: []const u8, args: []const u32, wire: ?[]u16 = null, error_name: ?[]const u8 = null };
const Bank = struct {
    a: std.mem.Allocator,
    wire_allocator: std.mem.Allocator,
    entries: std.ArrayList(Entry) = .empty,
    total_bytes: usize = 0,
    fn add(self: *Bank, name: []const u8, args: []const u32, result: anytype) !void {
        if (self.entries.items.len >= 32768) return error.RenderQueryBudget;
        const owned_args = try self.a.dupe(u32, args);
        const bytes = result catch |err| {
            try self.entries.append(self.a, .{ .name = name, .args = owned_args, .error_name = @errorName(err) });
            return;
        };
        defer self.wire_allocator.free(bytes);
        if (bytes.len > 32 * 1024 * 1024 - self.total_bytes) return error.RenderWireBudget;
        self.total_bytes += bytes.len;
        const wire = try self.a.alloc(u16, bytes.len);
        for (bytes, wire) |b, *w| w.* = b;
        try self.entries.append(self.a, .{ .name = name, .args = owned_args, .wire = wire });
    }
};
pub fn snapshot(output_a: std.mem.Allocator, session: *const Session, revision: u32) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(output_a);
    defer arena.deinit();
    const a = arena.allocator();
    const w = session.allocator;
    if (session.sections.len == 0 or session.sections.len > 4096) return error.RenderSectionBounds;
    var bank: Bank = .{ .a = a, .wire_allocator = w };
    try bank.add("paragraph_shape_ids", &.{}, Q.paragraph_shape_ids(w, session));
    try bank.add("paragraph_shapes", &.{}, Q.paragraph_shapes(w, session));
    try bank.add("page_settings", &.{}, Q.page_settings(w, session));
    try bank.add("note_shapes", &.{}, Q.note_shapes(w, session));
    try bank.add("tab_definitions", &.{}, Q.tab_definitions(w, session));
    try bank.add("section_tabs", &.{}, Q.section_tabs(w, session));
    try bank.add("character_shapes", &.{}, Q.character_shapes(w, session));
    try bank.add("font_faces", &.{}, Q.font_faces(w, session));
    try bank.add("font_face_metadata", &.{}, Q.font_face_metadata(w, session));
    try bank.add("character_font_metrics", &.{}, Q.character_font_metrics(w, session));
    try bank.add("character_text_colors", &.{}, Q.character_text_colors(w, session));
    try bank.add("character_shades", &.{}, Q.character_shades(w, session));
    try bank.add("character_effects", &.{}, Q.character_effects(w, session));
    try bank.add("character_outlines", &.{}, Q.character_outlines(w, session));
    try bank.add("character_font_references", &.{}, Q.character_font_references(w, session));
    try bank.add("character_strike_styles", &.{}, Q.character_strike_styles(w, session));
    try bank.add("character_strikes", &.{}, Q.character_strikes(w, session));
    try bank.add("character_underlines", &.{}, Q.character_underlines(w, session));
    try bank.add("character_underline_styles", &.{}, Q.character_underline_styles(w, session));
    const Paragraph = struct { nativeParagraph: usize, sourceNode: usize };
    const Section = struct { firstParagraph: usize, paragraphs: []const Paragraph };
    const sections = try a.alloc(Section, session.sections.len);
    var total: usize = 0;
    for (session.sections, 0..) |*section, index| {
        const si = std.math.cast(u32, index) orelse return error.RenderSectionBounds;
        var current = try @import("../hwpx/display_current_paragraphs.zig").read(w, section, session.options);
        defer current.deinit(w);
        if (current.paragraphs.len > 4096 - total) return error.RenderParagraphBounds;
        total += current.paragraphs.len;
        const paras = try a.alloc(Paragraph, current.paragraphs.len);
        for (current.paragraphs, paras, 0..) |p, *row, ordinal| {
            const pi = std.math.cast(u32, section.first_paragraph + ordinal) orelse return error.RenderParagraphBounds;
            row.* = .{ .nativeParagraph = pi, .sourceNode = p.template_element };
            try bank.add("character_ranges", &.{ si, pi }, Q.character_ranges(w, session, si, pi));
            try bank.add("tab_sources", &.{ si, pi }, Q.tab_sources(w, session, si, pi));
            try bank.add("anchor_text", &.{ si, pi }, Q.anchor_text(w, session, si, pi));
        }
        sections[index] = .{ .firstParagraph = section.first_paragraph, .paragraphs = paras };
        try bank.add("section_fill_brushes", &.{si}, Q.section_fill_brushes(w, session, si));
        try bank.add("paragraph_shape_refs", &.{si}, Q.paragraph_shape_refs(w, session, si));
        try bank.add("paragraph_text_snapshot", &.{si}, Q.paragraph_text_snapshot(w, session, si));
        try bank.add("paragraph_flow", &.{si}, Q.paragraph_flow(w, session, si));
        try bank.add("table_bindings", &.{si}, Q.table_bindings(w, session, si));
        try bank.add("table_placements", &.{si}, Q.table_placements(w, session, si));
        try bank.add("table_pagination", &.{si}, Q.table_pagination(w, session, si));
        try bank.add("table_border_sources", &.{si}, Q.table_border_sources(w, session, si));
        try bank.add("table_caption_bindings", &.{si}, Q.table_caption_bindings(w, session, si));
        try bank.add("picture_sites", &.{si}, Q.picture_sites(w, session, si));
        try bank.add("picture_owners", &.{si}, Q.picture_owners(w, session, si));
        try bank.add("picture_caption_bindings", &.{si}, Q.picture_caption_bindings(w, session, si));
        try bank.add("container_caption_bindings", &.{si}, Q.container_caption_bindings(w, session, si));
        try bank.add("drawing_text_bindings", &.{si}, Q.drawing_text_bindings(w, session, si));
        try bank.add("drawing_text_snapshots", &.{si}, Q.drawing_text_snapshots(w, session, si));
        try bank.add("rectangle_nodes", &.{si}, Q.rectangle_nodes(w, session, si));
        try bank.add("rectangle_rendering_sources", &.{si}, Q.rectangle_rendering_sources(w, session, si));
        try bank.add("ellipse_sources", &.{si}, Q.ellipse_sources(w, session, si));
        try bank.add("line_nodes", &.{si}, Q.line_nodes(w, session, si));
        try bank.add("connector_nodes", &.{si}, Q.connector_nodes(w, session, si));
        try bank.add("page_area_declarations", &.{si}, Q.page_area_declarations(w, session, si));
        try bank.add("note_reference_sites", &.{si}, Q.note_reference_sites(w, session, si));
        try bank.add("formula_field_sources", &.{si}, Q.formula_field_sources(w, session, si));
        const uri = @import("../hwpx/document_xml.zig").paragraph_uri;
        for (section.tree.elements, 0..) |element, node_index| {
            const node = std.math.cast(u32, node_index) orelse return error.RenderOwnerBounds;
            if (element.is(uri, "tbl")) {
                try bank.add("table_geometry", &.{ si, node }, Q.table_geometry(w, session, si, node));
                try bank.add("table_caption", &.{ si, node }, Q.table_caption(w, session, si, node));
            }
            if (element.is(uri, "subList")) {
                try bank.add("table_cell_margin", &.{ si, node }, Q.table_cell_margin(w, session, si, node));
            }
            if (element.is(uri, "pic")) {
                try bank.add("picture_owner", &.{ si, node }, Q.picture_owner(w, session, si, node));
                try bank.add("picture_position", &.{ si, node }, Q.picture_position(w, session, si, node));
                try bank.add("picture_flow", &.{ si, node }, Q.picture_flow(w, session, si, node));
                try bank.add("picture_geometry", &.{ si, node }, Q.picture_geometry(w, session, si, node));
                try bank.add("picture_crop", &.{ si, node }, Q.picture_crop(w, session, si, node));
                try bank.add("picture_transform", &.{ si, node }, Q.picture_transform(w, session, si, node));
                try bank.add("picture_rendering_corners", &.{ si, node }, Q.picture_rendering_corners(w, session, si, node));
                try bank.add("picture_caption", &.{ si, node }, Q.picture_caption(w, session, si, node));
            }
            if (element.is(uri, "line")) {
                try bank.add("line_display", &.{ si, node }, Q.line_display(w, session, si, node));
                try bank.add("line_placement", &.{ si, node }, Q.line_placement(w, session, si, node));
                try bank.add("line_geometry", &.{ si, node }, Q.line_geometry(w, session, si, node));
                try bank.add("drawing_stroke_source", &.{ si, node }, Q.drawing_stroke_source(w, session, si, node));
            }
            if (element.is(uri, "connectLine")) {
                try bank.add("connector_geometry_source", &.{ si, node }, Q.connector_geometry_source(w, session, si, node));
                try bank.add("connector_owner", &.{ si, node }, Q.connector_owner(w, session, si, node));
                try bank.add("connector_rendering_source", &.{ si, node }, Q.connector_rendering_source(w, session, si, node));
                try bank.add("connector_placement_source", &.{ si, node }, Q.connector_placement_source(w, session, si, node));
                try bank.add("drawing_stroke_source", &.{ si, node }, Q.drawing_stroke_source(w, session, si, node));
            }
            if (element.is(uri, "container")) {
                try bank.add("container_source_snapshot", &.{ si, node }, Q.container_source_snapshot(w, session, si, node));
            }
            if (element.is(uri, "rect")) {
                try bank.add("rectangle_rendering_source", &.{ si, node }, Q.rectangle_rendering_source(w, session, si, node));
            }
            if (element.is(uri, "pic")) {
                // Boolean protection uses the same Native dimension-value parser as WASM.
                const protection = @import("../hwpx/picture_dimension_values.zig").protection(w, &section.tree, node) catch |err| {
                    try bank.add("picture_size_protection", &.{ si, node }, @as(anyerror![]u8, err));
                    continue;
                };
                try bank.add("picture_size_protection", &.{ si, node }, std.json.Stringify.valueAlloc(w, protection, .{}));
            }
        }
    }
    const result = try std.json.Stringify.valueAlloc(output_a, .{ .protocol = "hwpjs.native-render-sources/3", .format = "hwpx", .revision = revision, .sectionCount = sections.len, .sections = sections, .queries = bank.entries.items }, .{});
    errdefer output_a.free(result);
    if (result.len > 64 * 1024 * 1024) return error.RenderWireBudget;
    return result;
}
