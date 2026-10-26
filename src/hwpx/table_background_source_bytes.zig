//! Resolve a source cell's header brush image without inventing a picture node.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const borders = @import("table_border_sources.zig");
const links = @import("fill_brush_image_links.zig");

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize, list_node: usize, max_bytes: usize) ![]u8 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    // There is no background-image edit intent. The preserved header remains authoritative.
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    return readTrees(a, document.archive, document.manifest, &session.sections[section].tree, &header, list_node, max_bytes);
}

pub fn readTrees(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, section: *const Tree, header: *const Tree, list_node: usize, max_bytes: usize) ![]u8 {
    var report = try borders.readTrees(a, section, header);
    defer report.deinit(a);
    var selected: ?borders.Cell = null;
    for (report.cells) |cell| {
        if (cell.list_node != list_node) continue;
        if (selected != null) return error.AmbiguousTableBackgroundCell;
        selected = cell;
    }
    const cell = selected orelse return error.MissingTableBackgroundCell;
    const style = report.styles[cell.style_index orelse return error.MissingTableBackgroundStyle];
    const fill = style.fill_report orelse return error.MissingTableBackgroundImage;
    if (fill.brushes.len != 1) return error.AmbiguousTableBackgroundImage;
    const brush = fill.brushes[0];
    if (brush.part_kind != .header or brush.section_ordinal != null or brush.parent_element_index != style.node or brush.element_index != style.fill_node)
        return error.InvalidTableBackgroundOwner;
    var images = try links.inspect(a, items, &fill, .{});
    defer images.deinit(a);
    if (images.sites.len == 0) return error.MissingTableBackgroundImage;
    if (images.sites.len != 1) return error.AmbiguousTableBackgroundImage;
    const image = images.sites[0];
    if (image.brush_index != 0 or image.part_kind != .header or image.section_ordinal != null) return error.InvalidTableBackgroundOwner;
    switch (image.target.state) {
        .embedded => {},
        .external => return error.ExternalTableBackgroundImage,
        .absent, .empty, .missing => return error.MissingTableBackgroundImage,
    }
    return @import("embedded_image_source_bytes.zig").read(archive, items, image.target.item_index orelse return error.InvalidImageLinkReport, max_bytes);
}

test {
    _ = @import("table_background_source_bytes_tests.zig");
}
