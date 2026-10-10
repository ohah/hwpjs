//! One owned HWPX editing session per WASM instance.
const std = @import("std");
const a = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const editor = @import("../hwpx/editor_session.zig");
const histories = @import("../hwpx/editor_history.zig");
var active: ?editor.Session = null;
var history: ?histories.History = null;
var output: ?[]u8 = null;

fn fail(err: anyerror) u32 {
    _ = errors.fail(err);
    return 0;
}
export fn hwpx_edit_output_free() void {
    if (output) |bytes| a.free(bytes);
    output = null;
}
export fn hwpx_edit_output_ptr() usize {
    return if (output) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn hwpx_edit_output_len() usize {
    return if (output) |bytes| bytes.len else 0;
}
export fn hwpx_edit_close() void {
    hwpx_edit_output_free();
    if (history) |*value| value.deinit();
    history = null;
    if (active) |*session| session.deinit();
    active = null;
}
export fn hwpx_edit_open(ptr: [*]const u8, size: usize) u32 {
    if (size > 64 * 1024 * 1024) return fail(error.LimitExceeded);
    const next = editor.open(a, ptr[0..size], .{}) catch |err| return fail(err);
    hwpx_edit_close();
    active = next;
    return 1;
}
export fn hwpx_edit_section_count() u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return std.math.maxInt(u32);
    };
    return @intCast(session.sections.len);
}
export fn hwpx_edit_form_source_nodes(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const nodes = @import("../hwpx/form_source_nodes.zig").read(a, &session.sections[section].tree, 100000) catch |err| return fail(err);
    defer a.free(nodes);
    output = std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .nodes = nodes }, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_form_sites(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const sites = @import("../hwpx/form_display_sites.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(sites);
    output = std.json.Stringify.valueAlloc(a, sites, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_form_source_attributes(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var value = @import("../hwpx/form_attribute_values.zig").read(a, &session.sections[section].tree, node, .{}) catch |err| return fail(err);
    defer value.deinit(a);
    output = @import("hwpx_form_attributes_wire.zig").encode(a, value) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_form_source_layout(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const value = @import("../hwpx/form_source_layout.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_checkbox_state(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const state = session.checkBoxState(section, node) catch |err| return fail(err);
    output = a.dupe(u8, @import("../hwpx/form_attribute_values.zig").stateText(state)) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_checkbox_state(section: u32, node: u32, ptr: [*]const u8, length: usize) u32 {
    if (length > 32) return fail(error.LimitExceeded);
    const state = @import("../hwpx/form_attribute_values.zig").parseButtonState(ptr[0..length]) catch |err| return fail(err);
    apply(.{ .kind = .check_box_state, .section = section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = node, .checkbox_state = state }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_bindings(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const bindings = @import("../hwpx/table_display_bindings.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(bindings);
    output = @import("hwpx_table_bindings_wire.zig").encode(a, bindings) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_placements(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/table_display_placements.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = @import("table_placements_wire.zig").encode(a, rows) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_drawing_text_bindings(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/drawing_text_bindings.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_drawing_text_snapshot(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const value = @import("../hwpx/drawing_text_snapshot.zig").read(a, session, section, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_drawing_text_snapshots(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/drawing_text_snapshots.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_container_source_snapshot(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var value = @import("../hwpx/container_source_snapshot.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    defer value.deinit(a);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_rectangle_rendering_source(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const source = @import("../hwpx/rectangle_rendering_source.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    const owner = @import("../hwpx/rectangle_display_host.zig").read(a, session, section, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, .{ .rectangle_node = node, .source = source, .owner = owner }, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_rectangle_rendering_sources(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/rectangle_rendering_sources.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_rectangle_nodes(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var nodes: std.ArrayList(usize) = .empty;
    defer nodes.deinit(a);
    for (session.sections[section].tree.elements, 0..) |element, node| {
        if (element.is(@import("../hwpx/document_xml.zig").paragraph_uri, "rect")) nodes.append(a, node) catch |err| return fail(err);
    }
    output = std.json.Stringify.valueAlloc(a, nodes.items, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_section_fill_brushes(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var report = @import("../hwpx/fill_brush.zig").inspectSections(a, &.{session.sections[section].tree}, .{}) catch |err| return fail(err);
    defer report.deinit(a);
    output = std.json.Stringify.valueAlloc(a, report, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_picture_sites(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/picture_display_sites.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = @import("hwpx_picture_sites_wire.zig").encode(a, rows) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_line_nodes(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const nodes = @import("../hwpx/line_display_snapshot.zig").nodes(a, session, section) catch |err| return fail(err);
    defer a.free(nodes);
    output = @import("hwpx_line_display_wire.zig").encodeNodes(a, nodes) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_connector_nodes(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const nodes = @import("../hwpx/connector_geometry_source.zig").nodes(a, &session.sections[section].tree, 100000) catch |err| return fail(err);
    defer a.free(nodes);
    output = std.json.Stringify.valueAlloc(a, nodes, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_connector_geometry_source(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    output = @import("../hwpx/connector_geometry_source.zig").encode(a, &session.sections[section].tree, node) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_connector_owner(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const value = @import("../hwpx/connector_owner_snapshot.zig").read(a, session, section, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_drawing_stroke_source(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    output = @import("../hwpx/drawing_stroke_source.zig").encode(a, &session.sections[section].tree, node) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_line_geometry(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const geometry = @import("../hwpx/line_display_snapshot.zig").readGeometry(a, session, section, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, .{ .current = true, .coordinateSpace = "renderingInfo", .paintable = false, .geometry = geometry }, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_connector_rendering_source(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    output = @import("../hwpx/connector_geometry_source.zig").encodeRendering(a, &session.sections[section].tree, node) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_connector_placement_source(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    output = @import("hwpx_connector_placement_wire.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_page_settings() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    var report = @import("../hwpx/page_settings_snapshot.zig").read(a, session) catch |err| return fail(err);
    defer report.deinit(a);
    output = std.json.Stringify.valueAlloc(a, report.pages, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_note_shapes() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    var report = @import("../hwpx/note_shapes_snapshot.zig").read(a, session) catch |err| return fail(err);
    defer report.deinit(a);
    output = std.json.Stringify.valueAlloc(a, report, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_paragraph_flow(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/paragraph_flow_snapshot.zig").read(a, session, section) catch |err| return fail(err);
    defer @import("../hwpx/paragraph_flow_snapshot.zig").free(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_pagination(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/table_pagination_snapshot.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_geometry(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const value = @import("../hwpx/table_geometry_values.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_caption(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const value = @import("../hwpx/table_caption_values.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_automatic_number_sources(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var snapshot = @import("../hwpx/automatic_number_snapshot.zig").read(a, &session.sections[section].tree) catch |err| return fail(err);
    defer snapshot.deinit(a);
    output = std.json.Stringify.valueAlloc(a, snapshot.rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_automatic_number_sites(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const sites = @import("../hwpx/automatic_number_sites.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(sites);
    output = std.json.Stringify.valueAlloc(a, sites, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_note_reference_sites(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const sites = @import("../hwpx/note_reference_sites.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(sites);
    output = std.json.Stringify.valueAlloc(a, sites, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_paragraph_text_snapshot(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/paragraph_text_snapshot.zig").read(a, session, section) catch |err| return fail(err);
    defer @import("../hwpx/paragraph_text_snapshot.zig").free(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_formula_field_sources(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const trees = a.alloc(@import("../hwpx/xml_part_tree.zig").Tree, session.sections.len) catch |err| return fail(err);
    defer a.free(trees);
    for (session.sections, trees) |source, *tree| tree.* = source.tree;
    var snapshot = @import("../hwpx/formula_field_snapshot.zig").read(a, trees, section) catch |err| return fail(err);
    defer snapshot.deinit(a);
    output = std.json.Stringify.valueAlloc(a, snapshot.rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_caption_bindings(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const bindings = @import("../hwpx/table_caption_bindings.zig").read(a, session, section) catch |err| return fail(err);
    defer a.free(bindings);
    output = std.json.Stringify.valueAlloc(a, bindings, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_formula_sources(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var snapshot = @import("../hwpx/formula_source_snapshot.zig").read(a, &session.sections[section].tree) catch |err| return fail(err);
    defer snapshot.deinit(a);
    output = std.json.Stringify.valueAlloc(a, snapshot.rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_formula_current(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    var snapshot = @import("../hwpx/formula_current_snapshot.zig").read(a, session, section) catch |err| return fail(err);
    defer snapshot.deinit(a);
    output = std.json.Stringify.valueAlloc(a, snapshot.rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_table_cell_margin(section: u32, list: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const value = @import("../hwpx/table_cell_margin_values.zig").readList(a, &session.sections[section].tree, list) catch |err| return fail(err);
    output = std.json.Stringify.valueAlloc(a, value, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_line_display(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const row = @import("../hwpx/line_display_snapshot.zig").read(a, session, section, node) catch |err| return fail(err);
    output = @import("hwpx_line_display_wire.zig").encode(a, row) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_line_placement(section: u32, node: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    output = @import("hwpx_line_placement_wire.zig").read(a, &session.sections[section].tree, node) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_bytes(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    output = @import("../hwpx/picture_source_bytes.zig").read(a, session, section, picture, 64 * 1024 * 1024) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_owner(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const owner = @import("../hwpx/picture_owner.zig").read(a, session, section, picture) catch |err| return fail(err);
    output = @import("hwpx_picture_owner_wire.zig").encode(a, owner) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_position(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const values = @import("../hwpx/picture_position_values.zig").read(a, &session.sections[section].tree, picture) catch |err| return fail(err);
    output = @import("hwpx_picture_position_wire.zig").encode(a, values) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_flow(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const values = @import("../hwpx/picture_flow_values.zig").read(a, &session.sections[section].tree, picture) catch |err| return fail(err);
    output = @import("hwpx_picture_flow_wire.zig").encode(a, values) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_rendering_corners(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const corners = @import("../hwpx/picture_rendering_corners.zig").readCurrent(a, &session.sections[section].tree, picture, &session.sections[section].picture_matrices, 1024) catch |err| return fail(err);
    output = @import("hwpx_picture_corners_wire.zig").encode(a, corners) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_geometry(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const tree = &session.sections[section].tree;
    var values = @import("../hwpx/picture_geometry_values.zig").read(a, tree, picture) catch |err| return fail(err);
    for (session.sections[section].picture_dimensions.items) |entry| {
        if (entry.picture_node != picture) continue;
        if (entry.update.display) |pair| {
            values.width = pair[0];
            values.height = pair[1];
        }
        break;
    }
    output = @import("hwpx_picture_geometry_wire.zig").encode(a, values) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_size_protection(section: u32, picture: u32) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 3;
    };
    if (section >= session.sections.len) {
        _ = fail(error.InvalidSectionIndex);
        return 3;
    }
    const value = @import("../hwpx/picture_dimension_values.zig").protection(a, &session.sections[section].tree, picture) catch |err| {
        _ = fail(err);
        return 3;
    };
    return if (value) |protected| if (protected) 2 else 1 else 0;
}
export fn hwpx_edit_picture_crop(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const values = @import("../hwpx/picture_crop_values.zig").read(a, &session.sections[section].tree, picture) catch |err| return fail(err);
    output = @import("hwpx_picture_crop_wire.zig").encode(a, values) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_picture_transform(section: u32, picture: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    var values = @import("../hwpx/picture_transform_values.zig").readCurrent(a, &session.sections[section].tree, picture, &session.sections[section].picture_matrices, 1024) catch |err| return fail(err);
    defer values.deinit(a);
    output = @import("hwpx_picture_transform_wire.zig").encode(a, &values) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_history_revision() u32 {
    if (history) |*value| return value.stack.revision;
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
export fn hwpx_edit_history_revision_count() u32 {
    if (history) |*value| return @intCast(value.stack.revisionCount());
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
export fn hwpx_edit_history_revision_at(index: u32) u32 {
    if (history) |*value| return value.stack.revisionAt(index) orelse {
        _ = fail(error.InvalidHistoryRevisionIndex);
        return std.math.maxInt(u32);
    };
    _ = fail(error.HistoryNotEnabled);
    return std.math.maxInt(u32);
}
export fn hwpx_edit_history_enable(entries: u32, checkpoint_bytes: u32) u32 {
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (history != null) return fail(error.HistoryAlreadyEnabled);
    if (@as(u64, entries) * checkpoint_bytes > 128 * 1024 * 1024) return fail(error.LimitExceeded);
    history = histories.History.init(session, entries, checkpoint_bytes) catch |err| return fail(err);
    return 1;
}
fn travel(redo: bool) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    const value = if (history) |*h| h else {
        _ = fail(error.HistoryNotEnabled);
        return 2;
    };
    const changed = (if (redo) value.redo(session) else value.undo(session)) catch |err| {
        _ = fail(err);
        return 2;
    };
    return @intFromBool(changed);
}
export fn hwpx_edit_undo() u32 {
    return travel(false);
}
export fn hwpx_edit_redo() u32 {
    return travel(true);
}
fn apply(command: histories.Command) !void {
    const session = if (active) |*value| value else return error.EditorNotOpen;
    if (command.kind == .created_table_stage) return error.UnsupportedCreatedTableCommand;
    if (history) |*value| {
        _ = try value.apply(session, command);
    } else switch (command.kind) {
        .created_table_stage => return error.UnsupportedCreatedTableCommand,
        .character_font_name => {
            const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
            _ = try session.setCharacterFontName(command.section, command.paragraph, command.start, end, command.font_language, command.font_name);
        },
        .formula_definition => {
            _ = try session.setFormulaDefinition(command.section, command.begin_element, command.inserted);
        },
        .character_properties => {
            if (command.inserted.len != 0) return error.InvalidFormatCommand;
            const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
            _ = try session.setCharacterProperties(command.section, command.paragraph, command.start, end, command.character_properties);
        },
        .paragraph_spacing => {
            _ = try session.setParagraphSpacing(command.section, command.paragraph, command.paragraph_spacing);
        },
        .paragraph_margins => {
            _ = try session.setParagraphMargins(command.section, command.paragraph, command.paragraph_margins);
        },
        .paragraph_alignment => {
            _ = try session.setParagraphAlignment(command.section, command.paragraph, command.paragraph_alignment);
        },
        .paragraph_format => {
            _ = try session.setParagraphFormat(command.section, command.paragraph, command.paragraph_shape_id);
        },
        .cell_size => {
            _ = try session.setCellSizeForList(command.section, command.list_node, command.cell_size);
        },
        .picture_dimensions => {
            _ = try session.setPictureDimensions(command.section, command.picture_node, command.picture_dimensions);
        },
        .check_box_state => {
            _ = try session.setCheckBoxState(command.section, command.form_node, command.checkbox_state);
        },
        .picture_resize => {
            _ = try session.resizePicture(command.section, command.picture_node, command.picture_size);
        },
        .format => {
            const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
            _ = try session.setCharacterFormat(command.section, command.paragraph, command.start, end, command.char_shape_id);
        },
        .plain => {
            _ = try session.splice(command.section, command.paragraph, command.start, command.deleted, command.inserted);
        },
        .anchored => {
            _ = try session.spliceAnchored(command.section, command.paragraph, command.start, command.deleted, command.inserted);
        },
        .field => {
            _ = try session.spliceFieldLabel(command.section, command.paragraph, command.begin_element, command.start, command.deleted, command.inserted);
        },
        .split => {
            _ = try session.splitParagraph(command.section, command.paragraph, command.start, command.deleted);
        },
        .split_anchored => {
            if (command.inserted.len != 0) return error.InvalidStructureCommand;
            _ = try session.splitParagraphAnchored(command.section, command.paragraph, command.start, command.deleted);
        },
        .merge => {
            _ = if (command.right_paragraph) |right| try session.mergeParagraphPair(command.section, command.paragraph, right) else try session.mergeParagraph(command.section, command.paragraph);
        },
    }
}
export fn hwpx_edit_set_cell_size(section: u32, list_node: u32, width: u32, height: u32) u32 {
    apply(.{ .kind = .cell_size, .section = section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .list_node = list_node, .cell_size = .{ .width = width, .height = height } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_resize_picture(section: u32, picture_node: u32, width: u32, height: u32) u32 {
    apply(.{ .kind = .picture_resize, .section = section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = picture_node, .picture_size = .{ width, height } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_group_picture_resize_available(section: u32, picture_node: u32) u32 {
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const plan = @import("../hwpx/picture_resize_plan.zig").build(session, section, picture_node, .{ 1, 1 }) catch |err| return fail(err);
    if (!plan.grouped) return fail(error.NotGroupedPictureResize);
    return 1;
}
export fn hwpx_edit_set_picture_dimensions(section: u32, picture_node: u32, mask: u32, display_width: u32, display_height: u32, original_width: u32, original_height: u32, current_width: u32, current_height: u32) u32 {
    const update = @import("hwpx_picture_dimension_args.zig").parse(mask, .{ display_width, display_height, original_width, original_height, current_width, current_height }) catch |err| return fail(err);
    apply(.{ .kind = .picture_dimensions, .section = section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = picture_node, .picture_dimensions = update }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_properties(section: u32, paragraph: u32, start: u32, end: u32, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (mask & ~@as(u32, 7) != 0 or (mask & 2 != 0 and bold > 1) or (mask & 4 != 0 and italic > 1)) return fail(error.InvalidCharacterProperties);
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{
        .size = if (mask & 1 != 0) size else null,
        .bold = if (mask & 2 != 0) bold != 0 else null,
        .italic = if (mask & 4 != 0) italic != 0 else null,
    } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_properties_ranges(ptr: [*]const u8, length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    if (mask & ~@as(u32, 7) != 0 or (mask & 2 != 0 and bold > 1) or (mask & 4 != 0 and italic > 1)) return fail(error.InvalidCharacterProperties);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{
        .size = if (mask & 1 != 0) size else null,
        .bold = if (mask & 2 != 0) bold != 0 else null,
        .italic = if (mask & 4 != 0) italic != 0 else null,
    }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
fn applyBatch(s: *editor.Session, commands: []const histories.Command) !void {
    if (history) |*value| {
        _ = try value.applyBatch(s, commands);
    } else {
        var temporary = try histories.History.init(s, 1, 128 * 1024 * 1024);
        defer temporary.deinit();
        _ = try temporary.applyBatch(s, commands);
    }
}
export fn hwpx_edit_set_character_font_ranges(ptr: [*]const u8, length: usize, language: u32, id: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const ids = @import("character_font_args.zig").decode(language, id) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .font_ids = ids }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_strike_ranges(ptr: [*]const u8, length: usize, value: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    if (value > 1) return fail(error.InvalidCharacterProperties);
    const s = if (active) |*value_session| value_session else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .strike_enabled = value == 1 }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_underline_ranges(ptr: [*]const u8, length: usize, value: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const kind = @import("character_underline_args.zig").decode(value) catch |err| return fail(err);
    const s = if (active) |*current| current else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .underline_kind = kind }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_text_color_ranges(ptr: [*]const u8, length: usize, color: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    @import("../model/rgb_color.zig").validate(color) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .text_color = color }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_shade_ranges(ptr: [*]const u8, length: usize, kind: u32, color: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const intent = @import("character_shade_args.zig").decode(kind, color) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .shade = intent }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_effect_ranges(ptr: [*]const u8, length: usize, kind: u32, enabled: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const patch = @import("character_effect_args.zig").decode(kind, enabled) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_effect_ranges_exclusive(ptr: [*]const u8, length: usize, kind: u32, enabled: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const patch = @import("character_effect_args.zig").decodeExclusive(kind, enabled) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_outline_ranges(ptr: [*]const u8, length: usize, kind: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16) return fail(error.LimitExceeded);
    const value = @import("character_outline_args.zig").decode(kind) catch |err| return fail(err);
    const s = if (active) |*session| session else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").build(.hwpx, a, ptr[0..length], .{ .outline_kind = value }) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_replace_paragraph_ranges_font_name(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, language: u32, name_ptr: [*]const u8, name_length: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024 or name_length > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwpx, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("named_font_replacement_commands.zig").build(.hwpx, a, replacement, @enumFromInt(language), name_ptr[0..name_length]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_replace_paragraph_ranges(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("paragraph_replace_request.zig").prepare(.hwpx, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_replace_paragraph_ranges_properties(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwpx, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("character_property_replacement_commands.zig").build(.hwpx, a, replacement, patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_replace_paragraph_ranges_font_name_properties(ptr: [*]const u8, length: usize, text_ptr: [*]const u8, text_length: usize, language: u32, name_ptr: [*]const u8, name_length: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or text_length > 4 * 1024 * 1024 or name_length > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const replacement = @import("paragraph_replace_request.zig").prepare(.hwpx, a, s, ptr[0..length], text_ptr[0..text_length]) catch |err| return fail(err);
    defer a.free(replacement);
    const commands = @import("character_property_replacement_commands.zig").buildWithFont(.hwpx, a, replacement, @enumFromInt(language), name_ptr[0..name_length], patch) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_strike(section: u32, paragraph: u32, start: u32, end: u32, value: u32) u32 {
    if (value > 1) return fail(error.InvalidCharacterProperties);
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .strike_enabled = value == 1 } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_underline(section: u32, paragraph: u32, start: u32, end: u32, value: u32) u32 {
    const kind = @import("character_underline_args.zig").decode(value) catch |err| return fail(err);
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .underline_kind = kind } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_underline_color(section: u32, paragraph: u32, start: u32, end: u32, color: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .underline_color = color } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_text_color(section: u32, paragraph: u32, start: u32, end: u32, color: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .text_color = color } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_shade(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, color: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    const intent = @import("character_shade_args.zig").decode(kind, color) catch |err| return fail(err);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .shade = intent } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_effect(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, enabled: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    const patch = @import("character_effect_args.zig").decode(kind, enabled) catch |err| return fail(err);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = patch }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_effect_exclusive(section: u32, paragraph: u32, start: u32, end: u32, kind: u32, enabled: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    const patch = @import("character_effect_args.zig").decodeExclusive(kind, enabled) catch |err| return fail(err);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = patch }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_outline(section: u32, paragraph: u32, start: u32, end: u32, kind: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    const value = @import("character_outline_args.zig").decode(kind) catch |err| return fail(err);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .outline_kind = value } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_font(section: u32, paragraph: u32, start: u32, end: u32, language: u32, id: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    const ids = @import("character_font_args.zig").decode(language, id) catch |err| return fail(err);
    apply(.{ .kind = .character_properties, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .character_properties = .{ .font_ids = ids } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_font_name(section: u32, paragraph: u32, start: u32, end: u32, language: u32, ptr: [*]const u8, size: usize) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    if (size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    apply(.{ .kind = .character_font_name, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .font_language = @enumFromInt(language), .font_name = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_font_name(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize) u32 {
    return spliceFontName(section, paragraph, start, end, text_ptr, text_size, language, name_ptr, name_size, 0, 0);
}
export fn hwpx_edit_splice_character_properties(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, mask: u32, size: i32, bold: u32, italic: u32) u32 {
    return spliceCharacterProperties(section, paragraph, start, end, text_ptr, text_size, mask, size, bold, italic, 0, 0);
}
export fn hwpx_edit_splice_font_name_properties(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize, mask: u32, size: i32, bold: u32, italic: u32, kind: u32, begin: u32) u32 {
    if (kind > 2) return fail(error.InvalidTextKind);
    if (text_size > 4 * 1024 * 1024 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_property_text_commands.zig").buildWithFont(.hwpx, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size], .language = @enumFromInt(language), .name = name_ptr[0..name_size], .text_kind = @enumFromInt(kind), .begin_element = begin }, patch) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_character_properties_protected(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, mask: u32, size: i32, bold: u32, italic: u32, kind: u32, begin: u32) u32 {
    return spliceCharacterProperties(section, paragraph, start, end, text_ptr, text_size, mask, size, bold, italic, kind, begin);
}
fn spliceCharacterProperties(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, mask: u32, size: i32, bold: u32, italic: u32, kind: u32, begin: u32) u32 {
    if (kind > 2) return fail(error.InvalidTextKind);
    if (text_size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    const patch = @import("character_property_args.zig").decode(mask, size, bold, italic) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_property_text_commands.zig").build(.hwpx, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size], .kind = @enumFromInt(kind), .begin_element = begin }, patch) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_font_name_protected(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize, kind: u32, begin: u32) u32 {
    return spliceFontName(section, paragraph, start, end, text_ptr, text_size, language, name_ptr, name_size, kind, begin);
}
fn spliceFontName(section: u32, paragraph: u32, start: u32, end: u32, text_ptr: [*]const u8, text_size: usize, language: u32, name_ptr: [*]const u8, name_size: usize, kind: u32, begin: u32) u32 {
    if (kind > 2) return fail(error.InvalidTextKind);
    if (text_size > 4 * 1024 * 1024 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("named_font_text_commands.zig").build(.hwpx, .{ .section = section, .paragraph = paragraph, .start = start, .end = end, .text = text_ptr[0..text_size], .language = @enumFromInt(language), .name = name_ptr[0..name_size], .text_kind = @enumFromInt(kind), .begin_element = begin }) catch |err| return fail(err);
    applyBatch(s, &commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_character_font_name_ranges(ptr: [*]const u8, length: usize, language: u32, name_ptr: [*]const u8, name_size: usize) u32 {
    if (length > @import("character_range_batch.zig").max_ranges * 16 or name_size > 4096) return fail(error.LimitExceeded);
    _ = @import("character_font_args.zig").decode(language, 0) catch |err| return fail(err);
    const s = if (active) |*value| value else return fail(error.EditorNotOpen);
    const commands = @import("character_range_commands.zig").buildFontName(.hwpx, a, ptr[0..length], @enumFromInt(language), name_ptr[0..name_size]) catch |err| return fail(err);
    defer a.free(commands);
    applyBatch(s, commands) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_paragraph_format(section: u32, paragraph: u32, id: u32) u32 {
    apply(.{ .kind = .paragraph_format, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_shape_id = id }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_paragraph_alignment(section: u32, paragraph: u32, value: u32) u32 {
    const Alignment = @import("../hwpx/paragraph_resource_clone.zig").Alignment;
    if (value >= std.meta.fields(Alignment).len) return fail(error.InvalidParagraphAlignment);
    apply(.{ .kind = .paragraph_alignment, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = @enumFromInt(value) }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_paragraph_margins(section: u32, paragraph: u32, mask: u32, left: i32, right: i32, indent: i32, before: i32, after: i32) u32 {
    if (mask & ~@as(u32, 31) != 0) return fail(error.InvalidParagraphMargins);
    apply(.{ .kind = .paragraph_margins, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_margins = .{
        .left = if (mask & 1 != 0) left else null,
        .right = if (mask & 2 != 0) right else null,
        .indent = if (mask & 4 != 0) indent else null,
        .before = if (mask & 8 != 0) before else null,
        .after = if (mask & 16 != 0) after else null,
    } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_paragraph_spacing(section: u32, paragraph: u32, kind: u32, value: i32) u32 {
    apply(.{ .kind = .paragraph_spacing, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_spacing = .{ .kind = kind, .value = value } }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_paragraph_shape_ids() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const ids = session.paragraphShapeIds() catch |err| return fail(err);
    defer a.free(ids);
    const bytes = a.alloc(u8, ids.len * 4) catch |err| return fail(err);
    for (ids, 0..) |id, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], id, .little);
    output = bytes;
    return 1;
}
export fn hwpx_edit_paragraph_shape_id(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const id = session.paragraphShapeId(section, paragraph) catch |err| return fail(err);
    const bytes = a.alloc(u8, 4) catch |err| return fail(err);
    std.mem.writeInt(u32, bytes[0..4], id, .little);
    output = bytes;
    return 1;
}
export fn hwpx_edit_paragraph_shape_refs(section_index: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section_index >= session.sections.len) return fail(error.InvalidSectionIndex);
    const section = &session.sections[section_index];
    var view = @import("../hwpx/display_current_paragraphs.zig").read(a, section, session.options) catch |err| return fail(err);
    defer view.deinit(a);
    const bytes = a.alloc(u8, 8 + view.paragraphs.len * 4) catch |err| return fail(err);
    var installed = false;
    defer if (!installed) a.free(bytes);
    std.mem.writeInt(u32, bytes[0..4], @intCast(section.first_paragraph), .little);
    std.mem.writeInt(u32, bytes[4..8], @intCast(view.paragraphs.len), .little);
    for (view.paragraphs, 0..) |paragraph, index| {
        const id = paragraph.paragraph_shape_id orelse (@import("../hwpx/paragraph_format_session.zig").sourceId(a, &section.tree, paragraph.template_element) catch |err| return fail(err));
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], id, .little);
    }
    output = bytes;
    installed = true;
    return 1;
}
export fn hwpx_edit_split(section: u32, paragraph: u32, start: u32, deleted: u32) u32 {
    apply(.{ .kind = .split, .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = "" }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_split_anchored(section: u32, paragraph: u32, start: u32, deleted: u32) u32 {
    apply(.{ .kind = .split_anchored, .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = "" }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_merge(section: u32, paragraph: u32) u32 {
    apply(.{ .kind = .merge, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "" }) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_merge_pair(section: u32, paragraph: u32, right: u32) u32 {
    apply(.{ .kind = .merge, .section = section, .paragraph = paragraph, .right_paragraph = right, .start = 0, .deleted = 0, .inserted = "" }) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_paragraph_neighbors(section: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    if (section >= session.sections.len) return fail(error.InvalidSectionIndex);
    const source = &session.sections[section];
    var view = @import("../hwpx/display_current_paragraphs.zig").read(a, source, session.options) catch |err| return fail(err);
    defer view.deinit(a);
    const values: @import("../hwpx/paragraph_structure_values.zig").Values = .{ .paragraphs = @constCast(view.paragraphs) };
    const length = std.math.add(usize, 8, std.math.mul(usize, view.paragraphs.len, 4) catch return fail(error.LimitExceeded)) catch return fail(error.LimitExceeded);
    const bytes = a.alloc(u8, length) catch |err| return fail(err);
    var installed = false;
    defer if (!installed) a.free(bytes);
    std.mem.writeInt(u32, bytes[0..4], std.math.cast(u32, source.first_paragraph) orelse return fail(error.LimitExceeded), .little);
    std.mem.writeInt(u32, bytes[4..8], @intCast(view.paragraphs.len), .little);
    for (view.paragraphs, 0..) |_, index| {
        const next = @import("../hwpx/paragraph_current_neighbor.zig").next(&source.tree, &values, index) catch |err| switch (err) {
            error.InvalidParagraphAdjacency => null,
            else => return fail(err),
        };
        const ordinal = if (next) |selected| std.math.add(usize, source.first_paragraph, selected) catch return fail(error.LimitExceeded) else 0;
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], std.math.cast(u32, ordinal) orelse return fail(error.LimitExceeded), .little);
    }
    output = bytes;
    installed = true;
    return 1;
}
export fn hwpx_edit_set_character_format(section: u32, paragraph: u32, start: u32, end: u32, id: u32) u32 {
    if (end < start) return fail(error.InvalidTextPosition);
    apply(.{ .kind = .format, .section = section, .paragraph = paragraph, .start = start, .deleted = end - start, .inserted = "", .char_shape_id = id }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_shape_ids() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const ids = @import("../hwpx/character_style_resources.zig").ids(session) catch |err| return fail(err);
    defer a.free(ids);
    const length = std.math.mul(usize, ids.len, 4) catch return fail(error.LimitExceeded);
    const bytes = a.alloc(u8, length) catch |err| return fail(err);
    for (ids, 0..) |id, index| std.mem.writeInt(u32, bytes[index * 4 ..][0..4], id, .little);
    output = bytes;
    return 1;
}
export fn hwpx_edit_paragraph_shapes() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = session.paragraphShapes() catch |err| return fail(err);
    defer @import("../hwpx/paragraph_display_resources.zig").deinit(a, shapes);
    output = std.json.Stringify.valueAlloc(a, shapes, .{}) catch |err| return fail(err);
    return 1;
}

export fn hwpx_edit_character_shapes() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    output = @import("character_shapes_wire.zig").encode(a, shapes) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_font_faces() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const snapshot = @import("../hwpx/font_face_snapshot.zig");
    const rows = @import("../hwpx/font_creation.zig").list(session) catch |err| return fail(err);
    defer snapshot.deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_text_colors() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_color_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .color = shape.text_color };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_shades() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    const snapshot = @import("../model/character_shade_snapshot.zig");
    const rows = a.alloc(snapshot.Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id.?, shape.shade);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_effects() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    const snapshot = @import("../model/character_effect_snapshot.zig");
    const rows = a.alloc(snapshot.Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = snapshot.row(shape.id.?, shape.effects);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_outlines() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = @import("../model/character_outline_snapshot.zig").Row;
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .state = if (shape.outline) |value| switch (value) {
        .none => .none,
        .solid => .solid,
        .unknown => .unknown,
    } else .absent, .rawKind = null };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_font_references() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const shapes = @import("../hwpx/character_style_resources.zig").displayShapes(session) catch |err| return fail(err);
    defer a.free(shapes);
    const Row = struct { id: u32, fontIds: ?@import("../hwpx/character_font_references.zig").Values };
    const rows = a.alloc(Row, shapes.len) catch |err| return fail(err);
    defer a.free(rows);
    for (shapes, rows) |shape, *row| row.* = .{ .id = shape.id.?, .fontIds = shape.font_ids };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_strike_styles() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const snapshot = @import("../hwpx/character_strike_styles.zig");
    const rows = snapshot.read(session) catch |err| return fail(err);
    defer snapshot.deinit(a, rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_strikes() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/character_strike_snapshot.zig").read(session) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_underlines() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const rows = @import("../hwpx/character_underline_snapshot.zig").read(session) catch |err| return fail(err);
    defer a.free(rows);
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_underline_styles() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const snapshot = @import("../hwpx/character_underline_snapshot.zig");
    const full = snapshot.readFull(session) catch |err| return fail(err);
    defer snapshot.deinit(a, full);
    const Row = @import("../model/character_underline_snapshot.zig").StyleRow;
    const rows = a.alloc(Row, full.len) catch |err| return fail(err);
    defer a.free(rows);
    for (full, rows) |value, *row| row.* = .{ .id = value.id, .shape = value.shape, .color = value.color };
    output = std.json.Stringify.valueAlloc(a, rows, .{}) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_character_ranges(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const spans = @import("../hwpx/character_style_snapshot.zig").read(session, section, paragraph) catch |err| return fail(err);
    defer a.free(spans);
    output = @import("../hwpx/character_style_wire.zig").encode(a, spans) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice(section: u32, paragraph: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_anchored(section: u32, paragraph: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .kind = .anchored, .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_anchor_text(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    output = session.anchorText(section, paragraph) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_splice_field_label(section: u32, paragraph: u32, begin_element: u32, start: u32, deleted: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4 * 1024 * 1024) return fail(error.LimitExceeded);
    apply(.{ .kind = .field, .section = section, .paragraph = paragraph, .begin_element = begin_element, .start = start, .deleted = deleted, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_set_formula_definition(section: u32, begin_element: u32, ptr: [*]const u8, size: usize) u32 {
    if (size > 4096) return fail(error.LimitExceeded);
    apply(.{ .kind = .formula_definition, .section = section, .paragraph = 0, .begin_element = begin_element, .start = 0, .deleted = 0, .inserted = ptr[0..size] }) catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_can_edit(section: u32, paragraph: u32) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    return @intFromBool(session.canEdit(section, paragraph) catch |err| {
        _ = fail(err);
        return 2;
    });
}
export fn hwpx_edit_can_split(section: u32, paragraph: u32, start: u32, deleted: u32) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    return @intFromBool(@import("../hwpx/paragraph_split_session.zig").canSplit(session, section, paragraph, start, deleted) catch |err| {
        _ = fail(err);
        return 2;
    });
}
export fn hwpx_edit_can_edit_outside_field(section: u32, paragraph: u32, start: u32, end: u32) u32 {
    const session = if (active) |*value| value else {
        _ = fail(error.EditorNotOpen);
        return 2;
    };
    return @intFromBool(@import("../hwpx/field_outside_query.zig").canEdit(session, section, paragraph, start, end) catch |err| {
        _ = fail(err);
        return 2;
    });
}
export fn hwpx_edit_save() u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    output = session.save() catch |err| return fail(err);
    return 1;
}
export fn hwpx_edit_field_labels(section: u32, paragraph: u32) u32 {
    hwpx_edit_output_free();
    const session = if (active) |*value| value else return fail(error.EditorNotOpen);
    const targets = session.fieldLabels(section, paragraph) catch |err| return fail(err);
    defer a.free(targets);
    const bytes = a.alloc(u8, 4 + targets.len * 12) catch |err| return fail(err);
    std.mem.writeInt(u32, bytes[0..4], @intCast(targets.len), .little);
    for (targets, 0..) |target, index| {
        const offset = 4 + index * 12;
        std.mem.writeInt(u32, bytes[offset..][0..4], target.begin_element, .little);
        std.mem.writeInt(u32, bytes[offset + 4 ..][0..4], target.start, .little);
        std.mem.writeInt(u32, bytes[offset + 8 ..][0..4], target.end, .little);
    }
    output = bytes;
    return 1;
}
