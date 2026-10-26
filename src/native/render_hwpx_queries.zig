//! Read-only wire marshalling reused from canonical wasm/hwpx_edit.zig.
const std = @import("std");
const Session = @import("../hwpx/editor_session.zig").Session;
pub fn paragraph_shape_ids(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    const bytes = try a.alloc(u8, ids.len * 4);
    for (ids, 0..) |id, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], id, .little);
    const result_bytes = bytes;
    return result_bytes;
}
pub fn paragraph_shapes(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try session.paragraphShapes();
    defer @import("../hwpx/paragraph_display_resources.zig").deinit(a, shapes);
    const result_bytes = try std.json.Stringify.valueAlloc(a, shapes, .{});
    return result_bytes;
}
pub fn page_settings(a: std.mem.Allocator, session: *const Session) ![]u8 {
    var report = try @import("../hwpx/page_settings_snapshot.zig").read(a, session);
    defer report.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, report.pages, .{});
    return result_bytes;
}
pub fn note_shapes(a: std.mem.Allocator, session: *const Session) ![]u8 {
    var report = try @import("../hwpx/note_shapes_snapshot.zig").read(a, session);
    defer report.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, report, .{});
    return result_bytes;
}
pub fn tab_definitions(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const result_bytes = try @import("../hwpx/tab_definition_snapshot.zig").encode(a, session);
    return result_bytes;
}
pub fn section_tabs(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const result_bytes = try @import("../hwpx/section_tab_snapshot.zig").encode(a, session);
    return result_bytes;
}
pub fn character_shapes(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const result_bytes = try @import("../wasm/character_shapes_wire.zig").encode(a, shapes);
    return result_bytes;
}
pub fn font_faces(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const snapshot = @import("../hwpx/font_face_snapshot.zig");
    const rows = try @import("../hwpx/font_creation.zig").list(session);
    defer snapshot.deinit(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn font_face_metadata(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const rows = try @import("../hwpx/font_creation.zig").metadata(session);
    defer @import("../hwpx/font_face_metadata.zig").deinit(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .fonts = rows }, .{});
    return result_bytes;
}
pub fn character_font_metrics(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const s = session;
    const rows = try @import("../hwpx/character_font_metrics.zig").list(s);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .format = "hwpx", .shapes = rows }, .{});
    return result_bytes;
}
pub fn character_text_colors(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const Row = @import("../model/character_color_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .color = shape.text_color };
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_shades(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const snapshot = @import("../model/character_shade_snapshot.zig");
    const rows = try a.alloc(snapshot.Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id.?, shape.shade);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_effects(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const snapshot = @import("../model/character_effect_snapshot.zig");
    const rows = try a.alloc(snapshot.Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id.?, shape.effects);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_outlines(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const Row = @import("../model/character_outline_snapshot.zig").Row;
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .state = if (shape.outline) |value| switch (value) {
        .none => .none,
        .solid => .solid,
        .unknown => .unknown,
    } else .absent, .rawKind = null };
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_font_references(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(session);
    defer a.free(shapes);
    const Row = struct { id: u32, fontIds: ?@import("../hwpx/character_font_references.zig").Values };
    const rows = try a.alloc(Row, shapes.len);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .fontIds = shape.font_ids };
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_strike_styles(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const snapshot = @import("../hwpx/character_strike_styles.zig");
    const rows = try snapshot.read(session);
    defer snapshot.deinit(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_strikes(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const rows = try @import("../hwpx/character_strike_snapshot.zig").read(session);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_underlines(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const rows = try @import("../hwpx/character_underline_snapshot.zig").read(session);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn character_underline_styles(a: std.mem.Allocator, session: *const Session) ![]u8 {
    const snapshot = @import("../hwpx/character_underline_snapshot.zig");
    const full = try snapshot.readFull(session);
    defer snapshot.deinit(a, full);
    const Row = @import("../model/character_underline_snapshot.zig").StyleRow;
    const rows = try a.alloc(Row, full.len);
    defer a.free(rows);
    for (full, rows) |value, *row| row.* = .{ .id = value.id, .shape = value.shape, .color = value.color };
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn section_fill_brushes(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var report = try @import("../hwpx/fill_brush.zig").inspectSections(a, &.{session.sections[section].tree}, .{});
    defer report.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, report, .{});
    return result_bytes;
}
pub fn paragraph_shape_refs(a: std.mem.Allocator, session: *const Session, section_index: u32) ![]u8 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var view = try @import("../hwpx/display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    const bytes = try a.alloc(u8, 8 + view.paragraphs.len * 4);
    var installed = false;
    defer if (!installed) a.free(bytes);
    std.mem.writeInt(u32, bytes[0..4], @intCast(section.first_paragraph), .little);
    std.mem.writeInt(u32, bytes[4..8], @intCast(view.paragraphs.len), .little);
    for (view.paragraphs, 0..) |paragraph, index| {
        const id = paragraph.paragraph_shape_id orelse (try @import("../hwpx/paragraph_format_session.zig").sourceId(a, &section.tree, paragraph.template_element));
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], id, .little);
    }
    const result_bytes = bytes;
    installed = true;
    return result_bytes;
}
pub fn paragraph_text_snapshot(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/paragraph_text_snapshot.zig").read(a, session, section);
    defer @import("../hwpx/paragraph_text_snapshot.zig").free(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn paragraph_flow(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/paragraph_flow_snapshot.zig").read(a, session, section);
    defer @import("../hwpx/paragraph_flow_snapshot.zig").free(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn table_bindings(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const bindings = try @import("../hwpx/table_display_bindings.zig").read(a, session, section);
    defer a.free(bindings);
    const result_bytes = try @import("../wasm/hwpx_table_bindings_wire.zig").encode(a, bindings);
    return result_bytes;
}
pub fn table_placements(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/table_display_placements.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try @import("../wasm/table_placements_wire.zig").encode(a, rows);
    return result_bytes;
}
pub fn table_pagination(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/table_pagination_snapshot.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn table_border_sources(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    var report = try @import("../hwpx/table_border_sources.zig").read(a, session, section);
    defer report.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .cells = report.cells, .styles = report.styles }, .{});
    return result_bytes;
}
pub fn table_caption_bindings(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const bindings = try @import("../hwpx/table_caption_bindings.zig").read(a, session, section);
    defer a.free(bindings);
    const result_bytes = try std.json.Stringify.valueAlloc(a, bindings, .{});
    return result_bytes;
}
pub fn picture_sites(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/picture_display_sites.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try @import("../wasm/hwpx_picture_sites_wire.zig").encode(a, rows);
    return result_bytes;
}
pub fn picture_owners(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/picture_owner_batch_report.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn picture_caption_bindings(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const bindings = try @import("../hwpx/picture_caption_bindings.zig").read(a, session, section);
    defer a.free(bindings);
    const result_bytes = try std.json.Stringify.valueAlloc(a, bindings, .{});
    return result_bytes;
}
pub fn container_caption_bindings(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const bindings = try @import("../hwpx/container_caption_bindings.zig").read(a, session, section);
    defer a.free(bindings);
    const result_bytes = try std.json.Stringify.valueAlloc(a, bindings, .{});
    return result_bytes;
}
pub fn drawing_text_bindings(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/drawing_text_bindings.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn drawing_text_snapshots(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/drawing_text_snapshots.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn rectangle_nodes(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (session.sections[section].tree.elements, 0..) |element, node| {
        if (element.is(@import("../hwpx/document_xml.zig").paragraph_uri, "rect")) try nodes.append(a, node);
    }
    const result_bytes = try std.json.Stringify.valueAlloc(a, nodes.items, .{});
    return result_bytes;
}
pub fn rectangle_rendering_sources(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/rectangle_rendering_sources.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn ellipse_sources(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const result_bytes = try @import("../hwpx/ellipse_sources.zig").encode(a, session, section);
    return result_bytes;
}
pub fn line_nodes(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const nodes = try @import("../hwpx/line_display_snapshot.zig").nodes(a, session, section);
    defer a.free(nodes);
    const result_bytes = try @import("../wasm/hwpx_line_display_wire.zig").encodeNodes(a, nodes);
    return result_bytes;
}
pub fn connector_nodes(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const nodes = try @import("../hwpx/connector_geometry_source.zig").nodes(a, &session.sections[section].tree, 100000);
    defer a.free(nodes);
    const result_bytes = try std.json.Stringify.valueAlloc(a, nodes, .{});
    return result_bytes;
}
pub fn page_area_declarations(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const rows = try @import("../hwpx/page_area_declaration_snapshot.zig").read(a, session, section);
    defer a.free(rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, rows, .{});
    return result_bytes;
}
pub fn note_reference_sites(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    const sites = try @import("../hwpx/note_reference_sites.zig").read(a, session, section);
    defer a.free(sites);
    const result_bytes = try std.json.Stringify.valueAlloc(a, sites, .{});
    return result_bytes;
}
pub fn formula_field_sources(a: std.mem.Allocator, session: *const Session, section: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const trees = try a.alloc(@import("../hwpx/xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |source, *tree| tree.* = source.tree;
    var snapshot = try @import("../hwpx/formula_field_snapshot.zig").read(a, trees, section);
    defer snapshot.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, snapshot.rows, .{});
    return result_bytes;
}
pub fn character_ranges(a: std.mem.Allocator, session: *const Session, section: u32, paragraph: u32) ![]u8 {
    const spans = try @import("../hwpx/character_style_snapshot.zig").read(session, section, paragraph);
    defer a.free(spans);
    const result_bytes = try @import("../hwpx/character_style_wire.zig").encode(a, spans);
    return result_bytes;
}
pub fn tab_sources(a: std.mem.Allocator, session: *const Session, section: u32, paragraph: u32) ![]u8 {
    const snapshot = @import("../hwpx/tab_display_snapshot.zig");
    const rows = try snapshot.read(session, section, paragraph);
    defer snapshot.deinit(a, rows);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .section = section, .paragraph = paragraph, .rows = rows }, .{});
    return result_bytes;
}
pub fn anchor_text(a: std.mem.Allocator, session: *const Session, section: u32, paragraph: u32) ![]u8 {
    _ = a;

    const result_bytes = try session.anchorText(section, paragraph);
    return result_bytes;
}
pub fn table_cell_margin(a: std.mem.Allocator, session: *const Session, section: u32, list: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const value = try @import("../hwpx/table_cell_margin_values.zig").readList(a, &session.sections[section].tree, list);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn table_geometry(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const value = try @import("../hwpx/table_geometry_values.zig").read(a, &session.sections[section].tree, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn table_caption(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const value = try @import("../hwpx/table_caption_values.zig").read(a, &session.sections[section].tree, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn picture_owner(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    const owner = try @import("../hwpx/picture_owner.zig").read(a, session, section, picture);
    const result_bytes = try @import("../wasm/hwpx_picture_owner_wire.zig").encode(a, owner);
    return result_bytes;
}
pub fn picture_position(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const values = try @import("../hwpx/picture_position_values.zig").read(a, &session.sections[section].tree, picture);
    const result_bytes = try @import("../wasm/hwpx_picture_position_wire.zig").encode(a, values);
    return result_bytes;
}
pub fn picture_flow(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const values = try @import("../hwpx/picture_flow_values.zig").read(a, &session.sections[section].tree, picture);
    const result_bytes = try @import("../wasm/hwpx_picture_flow_wire.zig").encode(a, values);
    return result_bytes;
}
pub fn picture_geometry(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    const current = &session.sections[section];
    const values = try @import("../hwpx/picture_current_geometry.zig").read(a, tree, &current.picture_dimensions, &current.picture_frames, picture);
    const result_bytes = try @import("../wasm/hwpx_picture_geometry_wire.zig").encode(a, values);
    return result_bytes;
}
pub fn picture_crop(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const values = try @import("../hwpx/picture_crop_values.zig").read(a, &session.sections[section].tree, picture);
    const result_bytes = try @import("../wasm/hwpx_picture_crop_wire.zig").encode(a, values);
    return result_bytes;
}
pub fn picture_transform(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var values = try @import("../hwpx/picture_transform_values.zig").readCurrent(a, &session.sections[section].tree, picture, &session.sections[section].picture_matrices, 1024);
    defer values.deinit(a);
    const result_bytes = try @import("../wasm/hwpx_picture_transform_wire.zig").encode(a, &values);
    return result_bytes;
}
pub fn picture_rendering_corners(a: std.mem.Allocator, session: *const Session, section: u32, picture: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const corners = try @import("../hwpx/picture_rendering_corners.zig").readCurrent(a, &session.sections[section].tree, picture, &session.sections[section].picture_matrices, 1024);
    const result_bytes = try @import("../wasm/hwpx_picture_corners_wire.zig").encode(a, corners);
    return result_bytes;
}
pub fn picture_caption(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const value = try @import("../hwpx/table_caption_values.zig").readPicture(a, &session.sections[section].tree, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn line_display(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    const row = try @import("../hwpx/line_display_snapshot.zig").read(a, session, section, node);
    const result_bytes = try @import("../wasm/hwpx_line_display_wire.zig").encode(a, row);
    return result_bytes;
}
pub fn line_placement(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const result_bytes = try @import("../wasm/hwpx_line_placement_wire.zig").read(a, &session.sections[section].tree, node);
    return result_bytes;
}
pub fn line_geometry(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    const geometry = try @import("../hwpx/line_display_snapshot.zig").readGeometry(a, session, section, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .current = true, .coordinateSpace = "renderingInfo", .paintable = false, .geometry = geometry }, .{});
    return result_bytes;
}
pub fn connector_geometry_source(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const result_bytes = try @import("../hwpx/connector_geometry_source.zig").encode(a, &session.sections[section].tree, node);
    return result_bytes;
}
pub fn connector_owner(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    const value = try @import("../hwpx/connector_owner_snapshot.zig").read(a, session, section, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn connector_rendering_source(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const result_bytes = try @import("../hwpx/connector_geometry_source.zig").encodeRendering(a, &session.sections[section].tree, node);
    return result_bytes;
}
pub fn connector_placement_source(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const result_bytes = try @import("../wasm/hwpx_connector_placement_wire.zig").read(a, &session.sections[section].tree, node);
    return result_bytes;
}
pub fn drawing_stroke_source(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const result_bytes = try @import("../hwpx/drawing_stroke_source.zig").encode(a, &session.sections[section].tree, node);
    return result_bytes;
}
pub fn container_source_snapshot(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var value = try @import("../hwpx/container_source_snapshot.zig").read(a, &session.sections[section].tree, node);
    defer value.deinit(a);
    const result_bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    return result_bytes;
}
pub fn rectangle_rendering_source(a: std.mem.Allocator, session: *const Session, section: u32, node: u32) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const source = try @import("../hwpx/rectangle_rendering_source.zig").read(a, &session.sections[section].tree, node);
    const owner = try @import("../hwpx/rectangle_display_host.zig").read(a, session, section, node);
    const result_bytes = try std.json.Stringify.valueAlloc(a, .{ .rectangle_node = node, .source = source, .owner = owner }, .{});
    return result_bytes;
}
