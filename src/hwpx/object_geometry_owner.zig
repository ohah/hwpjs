//! Current raw shape owners. Presentation coordinates never enter this module.
const std = @import("std");
const t = @import("../model/object_geometry.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const pair = @import("chart_pair_target.zig");
pub fn frame(value: @import("picture_geometry_values.zig").Values) !t.Frame {
    if (value.width_relative != 4 or value.height_relative != 2) return error.UnsupportedRelativeObjectGeometry;
    const result: t.Frame = .{
        .width = value.width orelse return error.MissingObjectGeometry,
        .height = value.height orelse return error.MissingObjectGeometry,
        .horizontalOffset = try @import("picture_frame_write.zig").signed(value.horizontal_offset orelse return error.MissingObjectGeometry),
        .verticalOffset = try @import("picture_frame_write.zig").signed(value.vertical_offset orelse return error.MissingObjectGeometry),
        .treatAsCharacter = value.treat_as_character orelse return error.MissingObjectGeometry,
    };
    try t.validateFrame(result);
    return result;
}
fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) ![]u8 {
    const raw = try tree.attributeValue(a, node, "", name) orelse return error.MissingObjectGeometryLink;
    const value = try raw.toUtf8(a, 4096);
    errdefer a.free(value);
    if (value.len == 0) return error.MissingObjectGeometryLink;
    return value;
}
/// Rebinding compares source-declared links; unique anchors are verified separately.
pub fn link(a: std.mem.Allocator, tree: *const Tree, selector: t.Selector) ![]u8 {
    if (selector.node >= tree.elements.len) return error.InvalidObjectGeometryTarget;
    if (selector.kind == .chart) {
        const owners = try pair.objects(tree, selector.node);
        const chart = try attribute(a, tree, owners.chart, "chartIDRef");
        defer a.free(chart);
        const ole = try attribute(a, tree, owners.ole, "binaryItemIDRef");
        defer a.free(ole);
        // Length framing avoids delimiter collisions in source attributes.
        return std.fmt.allocPrint(a, "chart:{d}:{s}{d}:{s}", .{ chart.len, chart, ole.len, ole });
    }
    if (!fields.childIs(tree, selector.node, "rect")) return error.InvalidObjectGeometryTarget;
    const id = try attribute(a, tree, selector.node, "id");
    defer a.free(id);
    return std.fmt.allocPrint(a, "rect:{s}", .{id});
}
pub const Protection = struct { size: bool, locked: bool };
pub fn protection(a: std.mem.Allocator, tree: *const Tree, node: usize) !Protection {
    var result: Protection = .{ .size = false, .locked = false };
    if (try tree.attributeValue(a, node, "", "lock")) |raw| result.locked = try fields.boolean(a, raw, 4096);
    var missing: usize = 0;
    var duplicate: usize = 0;
    const size = fields.uniqueChild(tree, node, "sz", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateObjectGeometryChild;
    if (size) |index| if (try tree.attributeValue(a, index, "", "protect")) |raw| {
        result.size = try fields.boolean(a, raw, 4096);
    };
    return result;
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, selector: t.Selector, revision: u64, binding: t.Binding) !t.Observation {
    if (selector.section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[selector.section].tree;
    const source_link = try link(a, tree, selector);
    errdefer a.free(source_link);
    var paragraph: usize = undefined;
    var unit: usize = undefined;
    var owner_node: usize = selector.node;
    var component_node: ?u32 = null;
    var current: t.Frame = undefined;
    var safe = true;
    var size_protected = false;
    var locked = false;
    if (selector.kind == .chart) {
        // Validate actual OPF/archive association as well as XML wrapper shape.
        var document = try @import("package.zig").inspectDocument(a, session.source, .{});
        defer document.deinit(a);
        var evidence = try pair.resolve(a, &document, tree, selector.node);
        defer evidence.deinit(a);
        const owners = try pair.objects(tree, selector.node);
        const chart_protection = try protection(a, tree, owners.chart);
        const ole_protection = try protection(a, tree, owners.ole);
        size_protected = chart_protection.size or ole_protection.size;
        locked = chart_protection.locked or ole_protection.locked;
        owner_node = owners.ole;
        component_node = @intCast(owners.chart);
        const declared = try frame(try @import("picture_geometry_values.zig").readChart(a, tree, owners.chart));
        current = try frame(try @import("picture_geometry_values.zig").readOle(a, tree, owners.ole));
        if (!std.meta.eql(declared, current)) return error.InconsistentChartObjectGeometry;
        var chart_transform = try @import("picture_transform_values.zig").readChart(a, tree, owners.chart, 1024);
        defer chart_transform.deinit(a);
        var ole_transform = try @import("picture_transform_values.zig").readOle(a, tree, owners.ole, 1024);
        defer ole_transform.deinit(a);
        safe = try supportedTransform(&chart_transform) and try supportedTransform(&ole_transform);
        const sites = try @import("chart_display_sites.zig").read(a, session, selector.section);
        defer a.free(sites);
        var found = false;
        for (sites) |site| if (site.wrapper == selector.node) {
            if (found or site.error_name != null) return error.AmbiguousObjectGeometryOwner;
            found = true;
            paragraph = site.paragraph orelse return error.MissingObjectGeometryOwner;
            unit = site.anchorUnit orelse return error.MissingObjectGeometryOwner;
        };
        if (!found) return error.MissingObjectGeometryOwner;
    } else {
        const host = try @import("rectangle_display_host.zig").read(a, session, selector.section, selector.node);
        paragraph = host.paragraph;
        unit = host.anchor_unit;
        const guards = try protection(a, tree, selector.node);
        size_protected = guards.size;
        locked = guards.locked;
        const source = try @import("rectangle_rendering_source.zig").read(a, tree, selector.node);
        current = try frame(source.geometry);
        var transform = try @import("picture_transform_values.zig").readRectangle(a, tree, selector.node, 1024);
        defer transform.deinit(a);
        safe = source.group_context == null and try supportedTransform(&transform);
        // This path is for a real text container, including an empty textbox.
        _ = try @import("drawing_text_values.zig").read(a, tree, selector.node) orelse return error.MissingDrawingText;
    }
    // Native protection policy remains authoritative, independently of UI state.
    const exterior = @import("field_source_outside_positions.zig").prepareAction(session, selector.section, paragraph, @intCast(unit), @intCast(try std.math.add(usize, unit, 1)), .splice) catch |err| switch (err) {
        error.ProtectedFieldRange => return error.ObjectGeometryReadOnly,
        else => return err,
    };
    if (exterior) |positions| session.allocator.free(positions);
    const editable = safe and !locked;
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    const session_binding = try a.dupe(u8, binding.session);
    errdefer a.free(session_binding);
    const serial_binding = try a.dupe(u8, binding.serial);
    return .{ .format = .hwpx, .selector = selector, .owner = .{ .ownerNode = @intCast(owner_node), .componentNode = component_node, .paragraph = @intCast(paragraph), .anchorUnit = @intCast(unit), .sourceSha256 = digest, .link = source_link }, .frame = current, .editable = .{ .size = editable and !size_protected, .position = editable }, .reason = if (!safe) "UnsupportedObjectGeometryTransform" else if (locked) "ObjectGeometryReadOnly" else if (size_protected) "ObjectGeometrySizeProtected" else null, .historyRevision = revision, .binding = .{ .session = session_binding, .serial = serial_binding } };
}
/// Known non-grouped, non-rotated transforms use the existing affine resize math.
/// Unknown rotation/group is never treated as identity or granted write authority.
fn supportedTransform(value: *const @import("picture_transform_values.zig").Values) !bool {
    if (value.angle != 0 or value.flip[0] != false or value.flip[1] != false or value.reverse != null) return false;
    const matrix = try @import("picture_transform_affine.zig").renderingMatrix(value);
    return matrix[0] > 0 and matrix[4] > 0 and matrix[1] == 0 and matrix[2] == 0 and matrix[3] == 0 and matrix[5] == 0;
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: t.Request) !void {
    var current = try observe(a, session, request.selector, request.historyRevision, request.binding);
    defer current.deinit(a);
    if (!std.meta.eql(current.frame, request.expected) or current.owner.ownerNode != request.owner.ownerNode or current.owner.componentNode != request.owner.componentNode or current.owner.paragraph != request.owner.paragraph or current.owner.anchorUnit != request.owner.anchorUnit or !std.mem.eql(u8, &current.owner.sourceSha256, &request.owner.sourceSha256) or !std.mem.eql(u8, current.owner.link, request.owner.link)) return error.StaleObjectGeometryOwner;
    if ((request.patch.width != null or request.patch.height != null) and !current.editable.size) return error.ObjectGeometryReadOnly;
    if ((request.patch.horizontalOffset != null or request.patch.verticalOffset != null or request.patch.treatAsCharacter != null) and !current.editable.position) return error.ObjectGeometryReadOnly;
}
