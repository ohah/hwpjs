//! Optional fixed-corner resize for a narrowly qualified floating picture.
const std = @import("std");
const editor = @import("editor_session.zig");
const geometry_anchor = @import("../model/picture_resize_anchor.zig");
pub const Anchor = geometry_anchor.Anchor;
pub const Expected = struct {
    section: usize,
    picture_node: usize,
    serial: u64,
    size: [2]u32,
    offsets: [2]i32,
    source_sha256: [32]u8,
};
pub const Intent = struct { anchor: Anchor, expected: Expected };

pub fn anchoredOffsets(before: [2]i32, original: [2]u32, size: [2]u32, anchor: Anchor) ![2]i32 {
    return geometry_anchor.offsets(before, original, size, anchor) catch |err| return switch (err) {
        error.InvalidSize => error.InvalidResizeAxisSize,
        error.NonIntegralOffset => error.NonIntegralAnchoredPictureOffset,
        error.OffsetOverflow => error.InvalidPictureOffset,
    };
}

pub fn observe(session: *const editor.Session, section_index: usize, picture: usize) !Expected {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    const a = session.allocator;
    const geometry = try @import("picture_current_geometry.zig").read(a, tree, &section.picture_dimensions, &section.picture_frames, picture);
    if (geometry.treat_as_character != false) return error.UnsupportedAnchoredInlinePictureResize;
    if (geometry.width_relative != 4 or geometry.height_relative != 2) return error.UnsupportedRelativePictureResize;
    if (try @import("grouped_shape_context.zig").read(tree, picture) != null) return error.UnsupportedAnchoredPictureGroup;
    const position = try @import("picture_position_values.zig").read(a, tree, picture);
    if (!std.meta.eql(position.relations, [4]?u32{ 1, 1, 0, 0 }) or
        !std.meta.eql(position.flags, [4]?bool{ false, false, true, false })) return error.UnsupportedAnchoredPicturePosition;
    const size = [2]u32{ geometry.width orelse return error.MissingPictureGeometry, geometry.height orelse return error.MissingPictureGeometry };
    if (size[0] == 0 or size[1] == 0) return error.InvalidResizeAxisSize;
    if (try @import("picture_dimension_values.zig").protection(a, tree, picture) != false) return error.PictureSizeProtected;
    const lock = try tree.attributeValue(a, picture, "", "lock") orelse return error.UnsupportedAnchoredPictureProtection;
    if (try @import("table_xml_fields.zig").boolean(a, lock, 4096)) return error.PictureReadOnly;
    var transform = try @import("picture_transform_values.zig").readCurrent(a, tree, picture, &section.picture_matrices, 1024);
    defer transform.deinit(a);
    if (transform.angle != 0 or transform.flip[0] != false or transform.flip[1] != false or transform.reverse != false or transform.unknown_matrix_nodes != 0) return error.UnsupportedAnchoredPictureTransform;
    const matrix = try @import("picture_transform_affine.zig").renderingMatrix(&transform);
    if (matrix[0] <= 0 or matrix[4] <= 0 or matrix[1] != 0 or matrix[3] != 0) return error.UnsupportedAnchoredPictureTransform;
    const corners = try @import("picture_rendering_corners.zig").readCurrent(a, tree, picture, &section.picture_matrices, 1024);
    const expected_corners = [_][2]f64{ .{ 0, 0 }, .{ @floatFromInt(size[0]), 0 }, .{ @floatFromInt(size[0]), @floatFromInt(size[1]) }, .{ 0, @floatFromInt(size[1]) } };
    for (corners, expected_corners) |actual, wanted| for (actual, wanted) |value, expected| {
        if (!std.math.isFinite(value) or @abs(value - expected) > 0.0000001) return error.UnsupportedAnchoredPictureFrame;
    };
    const sites = try @import("picture_display_sites.zig").read(a, session, section_index);
    defer a.free(sites);
    var matches: usize = 0;
    for (sites) |site| if (site.picture_node == picture) {
        matches += 1;
        if (site.state != .located) return error.UnsupportedAnchoredPictureOwner;
        const paragraph = site.paragraph orelse return error.UnsupportedAnchoredPictureOwner;
        const unit = site.anchor_unit orelse return error.UnsupportedAnchoredPictureOwner;
        const start = std.math.cast(u32, unit) orelse return error.InvalidTextPosition;
        const end = try std.math.add(u32, start, 1);
        const guard = try @import("field_source_outside_positions.zig").prepareAction(session, section_index, paragraph, start, end, .splice);
        if (guard) |positions| a.free(positions);
    };
    if (matches != 1) return error.UnsupportedAnchoredPictureOwner;
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    return .{ .section = section_index, .picture_node = picture, .serial = session.mutation_serial, .size = size, .offsets = .{ try @import("picture_frame_write.zig").signed(geometry.horizontal_offset orelse return error.MissingPicturePosition), try @import("picture_frame_write.zig").signed(geometry.vertical_offset orelse return error.MissingPicturePosition) }, .source_sha256 = digest };
}

pub fn build(session: *const editor.Session, section_index: usize, picture: usize, size: [2]u32, intent: Intent) !@import("picture_resize_plan.zig").Plan {
    const current = try observe(session, section_index, picture);
    if (!std.meta.eql(current, intent.expected)) return error.StaleAnchoredPictureResize;
    var plan = try @import("picture_resize_plan.zig").build(session, section_index, picture, size);
    if (plan.grouped or plan.frame != null) return error.UnsupportedAnchoredPictureTransform;
    const tree = &session.sections[section_index].tree;
    var transform = try @import("picture_transform_values.zig").readCurrent(session.allocator, tree, picture, &session.sections[section_index].picture_matrices, 1024);
    defer transform.deinit(session.allocator);
    var frame: @import("picture_frame_write.zig").Update = undefined;
    frame.offsets = try anchoredOffsets(current.offsets, current.size, size, intent.anchor);
    for (0..2) |axis| {
        const center = transform.center[axis] orelse return error.MissingPictureRotation;
        frame.center[axis] = std.math.cast(u32, center) orelse return error.InvalidPictureRotation;
    }
    plan.frame = frame;
    return plan;
}
