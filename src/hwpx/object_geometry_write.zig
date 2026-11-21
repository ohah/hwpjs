//! Whole-source preparation only. Managed document history publishes one complete candidate.
const std = @import("std");
const t = @import("../model/object_geometry.zig");
const owners = @import("object_geometry_owner.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
const attrs = @import("xml_scalar_attributes_upsert.zig");
const fields = @import("table_xml_fields.zig");
const affine = @import("picture_transform_affine.zig");
fn child(tree: *const Tree, node: usize, name: []const u8) !usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, node, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateObjectGeometryChild;
    return result orelse error.MissingObjectGeometryChild;
}
fn add(a: std.mem.Allocator, changes: *std.ArrayList(writer.Change), tree: *const Tree, node: usize, tag: []const u8) !void {
    const span = tree.elements[node].start_tag;
    try changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag });
}
// The enum/upsert serializer deliberately rejects minus signs. Position values
// use the existing source-bound writer with per-field signed/bool semantics.
const PositionValue = union(enum) { signed_offset: i32, as_character: bool };
fn positionEqual(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: PositionValue) !bool {
    return switch (value) {
        .signed_offset => |expected| try @import("picture_frame_write.zig").signed(try fields.margin(a, raw, 4096)) == expected,
        .as_character => |expected| try fields.boolean(a, raw, 4096) == expected,
    };
}
fn positionSerialize(a: std.mem.Allocator, quote: u8, value: PositionValue) ![]u8 {
    return switch (value) {
        .signed_offset => |number| std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, number, quote }),
        .as_character => |enabled| std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, @intFromBool(enabled), quote }),
    };
}
fn positionTag(a: std.mem.Allocator, tree: *const Tree, node: usize, frame: t.Frame, limit: usize) ![]u8 {
    return @import("xml_bound_attributes_write.zig").write(a, tree, node, &.{ "horzOffset", "vertOffset", "treatAsChar" }, PositionValue, .{ .{ .signed_offset = frame.horizontalOffset }, .{ .signed_offset = frame.verticalOffset }, .{ .as_character = frame.treatAsCharacter } }, positionEqual, positionSerialize, limit);
}
/// Apply scalar declarations and matrix changes together, retaining original shape points.
fn shape(a: std.mem.Allocator, tree: *const Tree, node: usize, kind: enum { chart, ole, rectangle }, before: t.Frame, after: t.Frame, changes: *std.ArrayList(writer.Change), limit: usize) !void {
    const protection = try owners.protection(a, tree, node);
    if (protection.locked) return error.ObjectGeometryReadOnly;
    const size_changed = before.width != after.width or before.height != after.height;
    if (size_changed) {
        if (protection.size) return error.ObjectGeometrySizeProtected;
        const pair = .{ try std.fmt.allocPrint(a, "{d}", .{after.width}), try std.fmt.allocPrint(a, "{d}", .{after.height}) };
        for ([_][]const u8{ "sz", "curSz" }) |name| {
            const target = try child(tree, node, name);
            try add(a, changes, tree, target, try attrs.write(a, tree, target, &.{ "width", "height" }, pair, limit));
        }
        var transform = switch (kind) {
            .chart => try @import("picture_transform_values.zig").readChart(a, tree, node, 1024),
            .ole => try @import("picture_transform_values.zig").readOle(a, tree, node, 1024),
            .rectangle => try @import("picture_transform_values.zig").readRectangle(a, tree, node, 1024),
        };
        defer transform.deinit(a);
        const total = try affine.renderingMatrix(&transform);
        var origin: [2]f64 = .{ 0, 0 };
        var basis: [2][2]f64 = undefined;
        if (kind == .rectangle) {
            const rectangle = try @import("picture_rectangle_values.zig").readRectangle(a, tree, node);
            for (0..2) |axis| origin[axis] = @floatFromInt(rectangle.points[0][axis] orelse return error.MissingObjectGeometryPoint);
            for ([_]usize{ 1, 3 }, 0..) |point, axis| for (0..2) |coordinate| {
                basis[axis][coordinate] = @as(f64, @floatFromInt(rectangle.points[point][coordinate] orelse return error.MissingObjectGeometryPoint)) - origin[coordinate];
            };
        } else {
            const original = try child(tree, node, "orgSz");
            const size = try fields.optionalUnsignedPair(a, tree, original, .{ "width", "height" }, 4096);
            basis = .{ .{ @floatFromInt(size[0] orelse return error.MissingObjectGeometry), 0 }, .{ 0, @floatFromInt(size[1] orelse return error.MissingObjectGeometry) } };
        }
        var axes: [2]f64 = undefined;
        for (basis, &axes) |direction, *length| {
            const x = total[0] * direction[0] + total[1] * direction[1];
            const y = total[3] * direction[0] + total[4] * direction[1];
            length.* = std.math.hypot(x, y);
        }
        const change = try @import("../geometry/resize_axes.zig").correction(basis, axes, .{ after.width, after.height });
        const desired = try @import("../geometry/resize_axes.zig").resizeInBasis(total, origin, change);
        const raw_desired = try affine.multiply(total, change);
        var translation = try affine.required(transform.matrices[0]);
        translation[2] += desired[2] - raw_desired[2];
        translation[5] += desired[5] - raw_desired[5];
        const scale = try affine.multiply(try affine.required(transform.matrices[transform.matrices.len - 2]), change);
        const rendering = try child(tree, node, "renderingInfo");
        var cursor = tree.elements[rendering].first_child;
        var first: ?usize = null;
        var last_scale: ?usize = null;
        while (cursor) |matrix| : (cursor = tree.elements[matrix].next_sibling) {
            const matrix_kind = @import("picture_matrix_fields.zig").kind(tree, matrix) orelse continue;
            if (first == null) first = matrix;
            if (matrix_kind == .scale) last_scale = matrix;
        }
        const translation_node = first orelse return error.MissingPictureMatrix;
        const scale_node = last_scale orelse return error.MissingPictureMatrix;
        try add(a, changes, tree, translation_node, try @import("picture_matrix_write.zig").write(a, tree, translation_node, translation, limit));
        try add(a, changes, tree, scale_node, try @import("picture_matrix_write.zig").write(a, tree, scale_node, scale, limit));
    }
    if (before.horizontalOffset != after.horizontalOffset or before.verticalOffset != after.verticalOffset or before.treatAsCharacter != after.treatAsCharacter) {
        const position = try child(tree, node, "pos");
        try add(a, changes, tree, position, try positionTag(a, tree, position, after, limit));
    }
    // Like the existing unrotated picture resize, retain original points,
    // original size and rotation center in their original coordinate basis.

}
pub fn writeTree(a: std.mem.Allocator, tree: *const Tree, selector: t.Selector, before: t.Frame, after: t.Frame, limit: usize) ![]u8 {
    if (std.meta.eql(before, after)) return a.dupe(u8, tree.source);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var changes: std.ArrayList(writer.Change) = .empty;
    if (selector.kind == .chart) {
        const pair = try @import("chart_pair_target.zig").objects(tree, selector.node);
        try shape(scratch, tree, pair.chart, .chart, before, after, &changes, limit);
        try shape(scratch, tree, pair.ole, .ole, before, after, &changes, limit);
    } else try shape(scratch, tree, selector.node, .rectangle, before, after, &changes, limit);
    // At most14 tags. Ordering only these bounded edits is independent of document size.
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, l: writer.Change, r: writer.Change) bool {
            return l.start < r.start;
        }
    }.less);
    return writer.write(a, tree.source, changes.items, limit);
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: t.Request, options: editor.Options) !?editor.Session {
    const after = try t.after(request.expected, request.patch);
    if (std.meta.eql(after, request.expected)) return null;
    var current = try editor.open(a, before, options);
    defer current.deinit();
    const selector = try rebindSaved(a, &current, request);
    const tree = &current.sections[request.selector.section].tree;
    const edited = try writeTree(a, tree, selector, request.expected, after, options.max_xml_bytes);
    defer a.free(edited);
    const bytes = try @import("page_settings_layout_cache.zig").remove(a, edited, request.selector.section, tree.item_index, options.max_xml_bytes);
    defer a.free(bytes);
    const package = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = current.sections[request.selector.section].entry_index, .bytes = bytes }}, .{ .max_output_bytes = options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, options);
}

/// Shared saved-source link/anchor rebind; never assumes old XML node numbers survive save.
pub fn rebindSaved(a: std.mem.Allocator, current: *const editor.Session, request: t.Request) !t.Selector {
    if (request.selector.section >= current.sections.len) return error.StaleObjectGeometryOwner;
    const tree = &current.sections[request.selector.section].tree;
    var selected: ?t.Selector = null;
    var candidates: std.ArrayList(usize) = .empty;
    defer candidates.deinit(a);
    var eligible: std.AutoHashMap(u32, void) = .init(a);
    defer eligible.deinit();
    // O(N) link scan. Do not repeatedly build current paragraphs/package views per node.
    for (tree.elements, 0..) |element, node| {
        if (request.selector.kind == .drawing) {
            if (!element.is(@import("document_xml.zig").paragraph_uri, "rect")) continue;
        } else if (!@import("run_switch_anchor.zig").supported(tree, node)) continue;
        const candidate: t.Selector = .{ .kind = request.selector.kind, .section = request.selector.section, .node = @intCast(node) };
        const source_link = owners.link(a, tree, candidate) catch |err| switch (err) {
            error.MissingObjectGeometryLink => continue,
            else => return err,
        };
        defer a.free(source_link);
        if (!std.mem.eql(u8, source_link, request.owner.link)) continue;
        try candidates.append(a, node);
        try eligible.put(candidate.node, {});
    }
    if (request.selector.kind == .drawing) {
        const hosts = try @import("rectangle_display_host.zig").readMany(a, current, request.selector.section, candidates.items);
        defer a.free(hosts);
        for (hosts, candidates.items) |host, node| {
            if (host.paragraph != request.owner.paragraph or host.anchor_unit != request.owner.anchorUnit) continue;
            if (selected != null) return error.AmbiguousObjectGeometryOwner;
            selected = .{ .kind = .drawing, .section = request.selector.section, .node = @intCast(node) };
        }
    } else {
        const sites = try @import("chart_display_sites.zig").read(a, current, request.selector.section);
        defer a.free(sites);
        for (sites) |site| {
            if (!eligible.contains(@intCast(site.wrapper)) or site.error_name != null or site.paragraph != request.owner.paragraph or site.anchorUnit != request.owner.anchorUnit) continue;
            if (selected != null) return error.AmbiguousObjectGeometryOwner;
            selected = .{ .kind = .chart, .section = request.selector.section, .node = @intCast(site.wrapper) };
        }
    }
    const selector = selected orelse return error.StaleObjectGeometryOwner;
    var observed = try owners.observe(a, current, selector, request.historyRevision, request.binding);
    defer observed.deinit(a);
    if (!std.meta.eql(observed.frame, request.expected) or observed.owner.paragraph != request.owner.paragraph or observed.owner.anchorUnit != request.owner.anchorUnit) return error.StaleObjectGeometryOwner;
    if ((request.patch.width != null or request.patch.height != null) and !observed.editable.size) return error.ObjectGeometryReadOnly;
    if ((request.patch.horizontalOffset != null or request.patch.verticalOffset != null or request.patch.treatAsCharacter != null) and !observed.editable.position) return error.ObjectGeometryReadOnly;
    return selector;
}
