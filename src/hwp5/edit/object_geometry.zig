//! Fixed-topology drawing edits retain live paragraph/table intents in their current Section.
const std = @import("std");
const t = @import("../../model/object_geometry.zig");
const Version = @import("../version.zig").Version;
const Paragraph = @import("../../model/document.zig").Paragraph;
const component = @import("../body/shape_component.zig");
const affine = @import("../../geometry/affine_row.zig");
pub fn observe(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const Paragraph, selector: t.Selector, revision: u64, binding: t.Binding, read_only: bool) !t.Observation {
    // An arbitrary OLE is not proof of a HWP5 chart. Keep this gap explicit.
    if (selector.kind == .chart) return error.UnsupportedHwp5ChartGeometryOwner;
    const sources = try @import("drawing_sources.zig").read(a, raw, version);
    defer a.free(sources);
    var selected: ?@import("drawing_sources.zig").Source = null;
    for (sources) |source| if (source.component_node == selector.node) {
        if (selected != null) return error.AmbiguousObjectGeometryOwner;
        selected = source;
    };
    const source = selected orelse return error.InvalidObjectGeometryTarget;
    if (source.kind_id != 0x24726563) return error.UnsupportedObjectGeometryKind;
    const bodies = try @import("drawing_list_sources.zig").read(a, raw, version);
    defer a.free(bodies);
    var body_count: usize = 0;
    for (bodies) |body| if (body.kind == .body and body.owner_node == selector.node and body.control_node == source.control_node) {
        body_count += 1;
    };
    if (body_count != 1) return error.MissingObjectGeometryTextOwner;
    const anchors = try @import("drawing_anchor_positions.zig").read(a, raw, version, paragraphs);
    defer a.free(anchors);
    var anchor: ?@import("drawing_anchor_positions.zig").Anchor = null;
    for (anchors) |item| if (item.component_node == selector.node and item.control_node == source.control_node) {
        if (anchor != null) return error.AmbiguousObjectGeometryOwner;
        anchor = item;
    };
    const host = anchor orelse return error.MissingObjectGeometryOwner;
    if (!@import("../body/object_common.zig").hasAbsoluteDimensions(source.flags)) return error.UnsupportedRelativeObjectGeometry;
    const frame: t.Frame = .{ .width = source.width, .height = source.height, .horizontalOffset = source.offset_x, .verticalOffset = source.offset_y, .treatAsCharacter = source.flags & 1 != 0 };
    try t.validateFrame(frame);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const shape = try component.Component.parse(tree.nodes[source.component_node].record.framing.payload, .double_id);
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    const safe = shape.group_count == 0 and shape.rotation_angle == 0 and !shape.horizontalFlip() and !shape.verticalFlip() and
        shape.offset_x == 0 and shape.offset_y == 0 and matrix[0] > 0 and matrix[4] > 0 and matrix[1] == 0 and matrix[2] == 0 and matrix[3] == 0 and matrix[5] == 0;
    const common = try @import("../body/object_common.zig").parseControl(tree.nodes[source.control_node].record.value.control_header);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, .{ .paragraphs = @constCast(paragraphs), .source_record_count = tree.nodes.len });
    defer a.free(spans);
    const object_end = try std.math.add(u32, host.current_unit, 8);
    var protected_field = false;
    for (spans) |span| {
        const starts_before_end = span.begin.paragraph < host.paragraph or (span.begin.paragraph == host.paragraph and span.begin.unit < object_end);
        const ends_after_start = span.end.paragraph > host.paragraph or (span.end.paragraph == host.paragraph and span.end.unit > host.current_unit);
        if (starts_before_end and ends_after_start) protected_field = true;
    }
    const editable = safe and !read_only and !protected_field;
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    const link = try std.fmt.allocPrint(a, "gso:{d}:rect:{d}", .{ source.instance_id, source.component_node });
    errdefer a.free(link);
    const session_binding = try a.dupe(u8, binding.session);
    errdefer a.free(session_binding);
    const serial_binding = try a.dupe(u8, binding.serial);
    return .{ .format = .hwp5, .selector = selector, .frame = frame, .owner = .{ .ownerNode = @intCast(source.control_node), .componentNode = @intCast(source.component_node), .paragraph = @intCast(host.paragraph), .anchorUnit = host.current_unit, .sourceSha256 = digest, .link = link }, .editable = .{ .size = editable and !common.sizeProtected(), .position = editable }, .reason = if (!safe) "UnsupportedObjectGeometryTransform" else if (read_only or protected_field) "ObjectGeometryReadOnly" else if (common.sizeProtected()) "ObjectGeometrySizeProtected" else null, .historyRevision = revision, .binding = .{ .session = session_binding, .serial = serial_binding } };
}
fn resize(a: std.mem.Allocator, payload: []const u8, rectangle: []const u8, target: [2]u32) ![]u8 {
    const shape = try component.Component.parse(payload, .double_id);
    const points = (try @import("../body/shape_rectangle.zig").Rectangle.parse(rectangle, .observed_points)).points;
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    const origin: [2]f64 = .{ @floatFromInt(points[0].x), @floatFromInt(points[0].y) };
    const basis: [2][2]f64 = .{
        .{ @as(f64, @floatFromInt(points[1].x)) - origin[0], @as(f64, @floatFromInt(points[1].y)) - origin[1] },
        .{ @as(f64, @floatFromInt(points[3].x)) - origin[0], @as(f64, @floatFromInt(points[3].y)) - origin[1] },
    };
    var axes: [2]f64 = undefined;
    for (basis, &axes) |direction, *length| length.* = std.math.hypot(matrix[0] * direction[0] + matrix[1] * direction[1], matrix[3] * direction[0] + matrix[4] * direction[1]);
    const change = try @import("../../geometry/resize_axes.zig").correction(basis, axes, target);
    const desired = try @import("../../geometry/resize_axes.zig").resizeInBasis(matrix, origin, change);
    const unanchored = try affine.multiply(matrix, change);
    const count = shape.rendering.pairs.count();
    if (count == 0) return error.MissingPictureMatrix;
    var translation: affine.Matrix = undefined;
    var scale: affine.Matrix = undefined;
    for (shape.rendering.translation.bits, &translation) |bits, *value| value.* = @bitCast(bits);
    for (shape.rendering.pairs.get(count - 1).?.scale.bits, &scale) |bits, *value| value.* = @bitCast(bits);
    translation[2] += desired[2] - unanchored[2];
    translation[5] += desired[5] - unanchored[5];
    const sized = try @import("drawing_current_size_payload.zig").write(a, payload, .double_id, .{ .width = target[0], .height = target[1] }, payload.len);
    defer a.free(sized);
    const translated = try @import("drawing_matrix_payload.zig").write(a, sized, .double_id, .translation, translation, payload.len);
    defer a.free(translated);
    const result = try @import("drawing_matrix_payload.zig").write(a, translated, .double_id, .{ .scale = count - 1 }, try affine.multiply(scale, change), payload.len);
    // Preserve the source-coordinate rotation center, as picture resize does.
    return result;
}
pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const Paragraph, request: t.Request, read_only: bool) !?[]u8 {
    var current = try observe(a, raw, version, paragraphs, request.selector, request.historyRevision, request.binding, read_only);
    defer current.deinit(a);
    if (!std.meta.eql(current.frame, request.expected) or current.owner.ownerNode != request.owner.ownerNode or current.owner.componentNode != request.owner.componentNode or current.owner.paragraph != request.owner.paragraph or current.owner.anchorUnit != request.owner.anchorUnit or !std.mem.eql(u8, &current.owner.sourceSha256, &request.owner.sourceSha256) or !std.mem.eql(u8, current.owner.link, request.owner.link)) return error.StaleObjectGeometryOwner;
    const size_changed = request.patch.width != null or request.patch.height != null;
    const position_changed = request.patch.horizontalOffset != null or request.patch.verticalOffset != null or request.patch.treatAsCharacter != null;
    if ((size_changed and !current.editable.size) or (position_changed and !current.editable.position)) return error.ObjectGeometryReadOnly;
    const after = try t.after(current.frame, request.patch);
    if (std.meta.eql(current.frame, after)) return null;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const control = tree.nodes[current.owner.ownerNode].record.framing;
    const shape = tree.nodes[request.selector.node].record.framing;
    const rectangle_node = (try @import("../body/owned_record.zig").find(tree, request.selector.node, @import("../body/shape_rectangle.zig").tag)) orelse return error.MissingObjectGeometryPoint;
    const output = try a.dupe(u8, raw);
    errdefer a.free(output);
    const control_offset = control.offset + control.raw.len - control.payload.len;
    if (after.width != current.frame.width or after.height != current.frame.height) {
        const sized = try @import("object_size_payload.zig").write(a, control.payload, .{ after.width, after.height }, control.payload.len);
        defer a.free(sized);
        @memcpy(output[control_offset..][0..sized.len], sized);
        const resized = try resize(a, shape.payload, tree.nodes[rectangle_node].record.framing.payload, .{ after.width, after.height });
        defer a.free(resized);
        const offset = shape.offset + shape.raw.len - shape.payload.len;
        @memcpy(output[offset..][0..resized.len], resized);
    }
    const flags = std.mem.readInt(u32, output[control_offset + 4 ..][0..4], .little);
    std.mem.writeInt(u32, output[control_offset + 4 ..][0..4], (flags & ~@as(u32, 1)) | @as(u32, @intFromBool(after.treatAsCharacter)), .little);
    std.mem.writeInt(i32, output[control_offset + 8 ..][0..4], after.verticalOffset, .little);
    std.mem.writeInt(i32, output[control_offset + 12 ..][0..4], after.horizontalOffset, .little);
    return output;
}
