//! Existing HWP5 source rectangle only. No display size, resource or tail rewriting.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const epoch = @import("../../model/history_mutation_epoch.zig");
pub const Selector = struct { section: u32, picture_node: u32 };
/// Source coordinates, NOT display HWPUNIT dimensions or decoded pixel coordinates.
pub const Rect = struct { left: i32, top: i32, right: i32, bottom: i32 };
pub const Basis = enum { original_dimensions, raster_96dpi };
pub const Extent = struct { width: u32, height: u32, basis: Basis };
pub const Target = struct {
    selector: Selector,
    control_node: u32,
    component_node: u32,
    paragraph_node: u32,
    paragraph: u32,
    anchor_unit: u32,
    resource_ordinal: u16,
    version_raw: u32,
    source_sha256: [32]u8,
    resource_sha256: [32]u8,
    ticket: epoch.Ticket,
};
pub const Observation = struct { target: Target, rect: Rect, extent: Extent };
pub const Request = struct { before: Observation, rect: Rect };
pub const max_source_bytes = 32 * 1024 * 1024;

pub fn validateRect(rect: Rect, extent: Extent) !void {
    const rectangle: @import("../../model/picture_crop_rectangle.zig").Rectangle = .{ .left = rect.left, .top = rect.top, .right = rect.right, .bottom = rect.bottom };
    if (extent.width == 0 or extent.height == 0 or extent.width > std.math.maxInt(i32) or extent.height > std.math.maxInt(i32) or !rectangle.fits(extent.width, extent.height)) return error.InvalidPictureCropRectangle;
}
fn jpegMarker(marker: @import("../../image/jpeg/markers.zig").Marker) anyerror!void {
    // No orientation reinterpretation: all APP1 (Exif/XMP) is outside this cohort.
    if (marker.code == 0xe1) return error.UnsupportedPictureCropMetadata;
}
/// Explicit version/layout selection, complete tail consumption and validated raster bounds.
/// 75 is the existing own host policy when original dimensions are absent, not a spec constant.
pub fn sourceExtent(payload: []const u8, version: Version, resource: []const u8) !Extent {
    if (version.raw >= 0x05010000) return error.UnsupportedPictureCropVersion;
    const layout = @import("image_insertion_profile.zig").layout(version) catch return error.UnsupportedPictureCropVersion;
    const picture = try @import("../body/shape_picture.zig").Picture.parse(payload, .interleaved, .with_instance78);
    var reader: @import("../../binary/reader.zig").Reader = .{ .bytes = picture.extra };
    const tail = try @import("../body/picture_tail.zig").Tail.read(&reader, switch (layout) {
        .effects_only => null,
        .dimensions8 => .dimensions8,
        .with_alpha9 => .with_alpha9,
    });
    if (reader.offset != picture.extra.len or tail.effects.flags != 0) return error.UnsupportedPictureCropTail;
    const raster = try @import("../../image/picture_input.zig").inspectRaster(resource, 8 * 1024 * 1024);
    if (std.mem.eql(u8, raster.media.mime, "image/png")) {
        var chunks = try @import("../../image/png/chunks.zig").Iterator.init(resource, .{});
        while (try chunks.next()) |chunk| {
            if (chunk.is("eXIf")) return error.UnsupportedPictureCropMetadata;
            if (chunk.is("acTL") or chunk.is("fcTL") or chunk.is("fdAT")) return error.UnsupportedPictureCropAnimation;
        }
    } else {
        _ = try @import("../../image/jpeg/structure.zig").inspectWithMarkerCheck(resource, .{}, jpegMarker);
    }
    const result: Extent = if (tail.properties) |properties|
        .{ .width = properties.width, .height = properties.height, .basis = .original_dimensions }
    else blk: {
        const size = try @import("image_insertion_profile.zig").sourceSize(raster.pixels);
        break :blk .{ .width = size.width, .height = size.height, .basis = .raster_96dpi };
    };
    if (result.width == 0 or result.height == 0 or result.width > std.math.maxInt(i32) or result.height > std.math.maxInt(i32)) return error.InvalidPictureCropExtent;
    return result;
}

pub fn observe(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, selector: Selector, ticket: epoch.Ticket, read_only: bool, resource: []const u8) !Observation {
    if (read_only) return error.PictureCropReadOnly;
    if (raw.len > max_source_bytes) return error.LimitExceeded;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const root = try @import("picture_size_protection.zig").rootOwner(tree, selector.picture_node);
    const component_node = tree.nodes[selector.picture_node].parent orelse return error.InvalidPictureCropOwner;
    if (tree.nodes[component_node].parent != root) return error.UnsupportedPictureCropGroup;
    if (try @import("../body/shape_validation.zig").componentLayout(tree, component_node) != .double_id) return error.UnsupportedPictureCropTransform;
    const shape = try @import("../body/shape_component.zig").Component.parse(tree.nodes[component_node].record.framing.payload, .double_id);
    if (shape.group_count != 0 or shape.rotation_angle != 0 or shape.horizontalFlip() or shape.verticalFlip() or shape.offset_x != 0 or shape.offset_y != 0) return error.UnsupportedPictureCropTransform;
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    for (matrix) |value| if (!std.math.isFinite(value)) return error.UnsupportedPictureCropTransform;
    if (matrix[0] <= 0 or matrix[4] <= 0 or matrix[1] != 0 or matrix[2] != 0 or matrix[3] != 0 or matrix[5] != 0) return error.UnsupportedPictureCropTransform;
    const common_module = @import("../body/object_common.zig");
    const common = try common_module.parseControl(tree.nodes[root].record.value.control_header);
    if (!common_module.hasAbsoluteDimensions(common.flags) or common.width == 0 or common.height == 0 or common.sizeProtected() or common.hasCaption()) return error.UnsupportedPictureCropGeometry;
    const anchors = try @import("drawing_anchor_positions.zig").read(a, raw, version, current.paragraphs);
    defer a.free(anchors);
    var selected: ?@import("drawing_anchor_positions.zig").Anchor = null;
    for (anchors) |anchor| if (anchor.control_node == root and anchor.component_node == component_node) {
        if (selected != null) return error.AmbiguousPictureCropOwner;
        selected = anchor;
    };
    const anchor = selected orelse return error.MissingPictureCropAnchor;
    const paragraph_node = tree.nodes[root].parent orelse return error.UnsupportedPictureCropHost;
    if (anchor.paragraph >= current.paragraphs.len or current.paragraphs[anchor.paragraph].parent_node != null or (current.paragraphs[anchor.paragraph].source_node == null or @as(usize, current.paragraphs[anchor.paragraph].source_node.?) != paragraph_node) or tree.nodes[paragraph_node].parent != null) return error.UnsupportedPictureCropHost;
    // Existing current-token/field-span fence. Never turn a size or crop edit into field access.
    try @import("picture_replacement_current.zig").validateOwner(a, raw, version, current, selector.picture_node);
    const bodies = try @import("drawing_list_sources.zig").read(a, raw, version);
    defer a.free(bodies);
    for (bodies) |body| if (body.control_node == root) return error.UnsupportedPictureCropHost;
    const payload = tree.nodes[selector.picture_node].record.framing.payload;
    const picture = try @import("../body/shape_picture.zig").Picture.parse(payload, .interleaved, .with_instance78);
    if (picture.image.bin_data_id == 0) return error.InvalidPictureCropResource;
    const p0 = picture.points.get(0).?;
    const p1 = picture.points.get(1).?;
    const p2 = picture.points.get(2).?;
    const p3 = picture.points.get(3).?;
    if (p0.x != 0 or p0.y != 0 or p1.x <= 0 or p1.y != 0 or p2.x != p1.x or p2.y != p3.y or p3.x != 0 or p3.y <= 0 or shape.current_width != common.width or shape.current_height != common.height) return error.UnsupportedPictureCropGeometry;
    const width: f64 = @floatFromInt(common.width);
    const height: f64 = @floatFromInt(common.height);
    if (@abs(matrix[0] * @as(f64, @floatFromInt(p1.x)) - width) > 32 * std.math.floatEps(f64) * width or @abs(matrix[4] * @as(f64, @floatFromInt(p3.y)) - height) > 32 * std.math.floatEps(f64) * height) return error.UnsupportedPictureCropGeometry;
    const extent = try sourceExtent(payload, version, resource);
    const rect: Rect = .{ .left = picture.crop[0], .top = picture.crop[1], .right = picture.crop[2], .bottom = picture.crop[3] };
    try validateRect(rect, extent);
    var source_sha256: [32]u8 = undefined;
    var resource_sha256: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &source_sha256, .{});
    std.crypto.hash.sha2.Sha256.hash(resource, &resource_sha256, .{});
    return .{ .target = .{ .selector = selector, .control_node = @intCast(root), .component_node = @intCast(component_node), .paragraph_node = @intCast(paragraph_node), .paragraph = @intCast(anchor.paragraph), .anchor_unit = anchor.current_unit, .resource_ordinal = picture.image.bin_data_id, .version_raw = version.raw, .source_sha256 = source_sha256, .resource_sha256 = resource_sha256, .ticket = ticket }, .rect = rect, .extent = extent };
}

pub fn validate(before: Observation, request: Request) !bool {
    if (!std.meta.eql(before, request.before)) return error.StalePictureCropTarget;
    try validateRect(request.rect, before.extent);
    return !std.meta.eql(before.rect, request.rect);
}
/// Exactly the four signed words at table107 payload offset44. All other bytes remain identical.
pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, request: Request, ticket: epoch.Ticket, read_only: bool, resource: []const u8) !?[]u8 {
    const before = try observe(a, raw, version, current, request.before.target.selector, ticket, read_only, resource);
    if (!try validate(before, request)) return null;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[before.target.selector.picture_node].record.framing;
    const at = record.offset + record.raw.len - record.payload.len + 44;
    if (at > raw.len or raw.len - at < 16) return error.InvalidPictureCropOwner;
    const next = try a.dupe(u8, raw);
    for ([_]i32{ request.rect.left, request.rect.top, request.rect.right, request.rect.bottom }, 0..) |value, i| std.mem.writeInt(i32, next[at + 4 * i ..][0..4], value, .little);
    return next;
}
