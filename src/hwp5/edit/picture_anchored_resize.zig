//! Anchored resize for a qualified fixed PAGE/PAGE HWP5 picture. Legacy resize stays separate.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const owner = @import("object_outer_margins.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
const geometry_anchor = @import("../../model/picture_resize_anchor.zig");
pub const Anchor = geometry_anchor.Anchor;
pub const Frame = @import("../../model/object_geometry.zig").Frame;
pub const Observation = struct { target: owner.Target, frame: Frame };
pub const Request = struct { target: owner.Target, expected: Frame, width: u32, height: u32, anchor: Anchor };
const maximum = 32 * 1024 * 1024;

pub fn after(before: Frame, width: u32, height: u32, anchor: Anchor) !Frame {
    if (width == 0 or height == 0 or before.width == 0 or before.height == 0) return error.InvalidAnchoredPictureSize;
    if (before.treatAsCharacter) return error.UnsupportedAnchoredPictureProfile;
    const position = geometry_anchor.offsets(
        .{ before.horizontalOffset, before.verticalOffset },
        .{ before.width, before.height },
        .{ width, height },
        anchor,
    ) catch |err| return switch (err) {
        error.InvalidSize => error.InvalidAnchoredPictureSize,
        error.NonIntegralOffset => error.UnrepresentableAnchoredPictureOffset,
        error.OffsetOverflow => error.AnchoredPictureOffsetOverflow,
    };
    return .{ .width = width, .height = height, .horizontalOffset = position[0], .verticalOffset = position[1], .treatAsCharacter = false };
}

/// Resolve just this target's pending legacy size/matrices before binding or rewriting it.
/// Other picture intents stay owned by the caller and are not baked into this source basis.
fn effective(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, picture: u32) ![]u8 {
    var selected: ?model.PictureCurrentSize = null;
    for (section.picture_current_sizes orelse &.{}) |value| if (value.source_picture_node == picture) {
        if (selected != null) return error.DuplicatePictureEdit;
        selected = value;
    };
    if (selected) |value| return @import("picture_current_size_section.zig").writeAll(a, raw, version, &.{value}, maximum);
    if (raw.len > maximum) return error.LimitExceeded;
    return a.dupe(u8, raw);
}

pub fn observe(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, selector: owner.Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    if (selector.kind != .picture) return error.InvalidAnchoredPictureTarget;
    const current = try effective(a, raw, version, section, selector.node);
    defer a.free(current);
    return observeEffective(a, current, version, section, selector, ticket, read_only);
}

fn observeEffective(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, selector: owner.Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    const observed = try owner.read(a, raw, version, section, selector, ticket, read_only);
    if (!observed.editable) return error.AnchoredPictureReadOnly;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const common = try @import("../body/object_common.zig").parseControl(tree.nodes[observed.target.control_node].record.value.control_header);
    // Explicit PAGE/PAGE, TOP/LEFT, absolute dimensions, floating Square, no
    // restriction-induced movement, known unprotected source flags only.
    const flags: u32 = (4 << 15) | (2 << 18) | (1 << 3) | (1 << 8) | (1 << 14);
    if (common.flags != flags or common.sizeProtected()) return error.UnsupportedAnchoredPictureProfile;
    const host = section.paragraphs[observed.target.paragraph];
    if (host.source_node == null or host.source_node.? != observed.target.paragraph_node or host.header_template != null or tree.nodes[observed.target.paragraph_node].parent != null) return error.UnsupportedAnchoredPictureProfile;
    const component_node = observed.target.component_node;
    if (try @import("../body/shape_validation.zig").componentLayout(tree, component_node) != .double_id) return error.UnsupportedAnchoredPictureProfile;
    const shape = try @import("../body/shape_component.zig").Component.parse(tree.nodes[component_node].record.framing.payload, .double_id);
    if (shape.group_count != 0 or shape.rotation_angle != 0 or shape.horizontalFlip() or shape.verticalFlip() or shape.offset_x != 0 or shape.offset_y != 0 or shape.rendering.pairs.count() != 1) return error.UnsupportedAnchoredPictureProfile;
    const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
    if (matrix[0] <= 0 or matrix[4] <= 0 or matrix[1] != 0 or matrix[2] != 0 or matrix[3] != 0 or matrix[5] != 0) return error.UnsupportedAnchoredPictureProfile;
    const rotation = shape.rendering.pairs.get(0).?.rotation;
    for (rotation.bits, [_]f64{ 1, 0, 0, 0, 1, 0 }) |bits, expected| if (@as(f64, @bitCast(bits)) != expected) return error.UnsupportedAnchoredPictureProfile;
    const picture = try @import("../body/shape_picture.zig").Picture.parse(tree.nodes[selector.node].record.framing.payload, .interleaved, .base73);
    const p0 = picture.points.get(0).?;
    const p1 = picture.points.get(1).?;
    const p2 = picture.points.get(2).?;
    const p3 = picture.points.get(3).?;
    if (p0.x != 0 or p0.y != 0 or p1.x <= 0 or p1.y != 0 or p2.x != p1.x or p2.y != p3.y or p3.x != 0 or p3.y <= 0) return error.UnsupportedAnchoredPictureProfile;
    if (common.width == 0 or common.height == 0 or shape.current_width != common.width or shape.current_height != common.height) return error.UnsupportedAnchoredPictureProfile;
    const width: f64 = @floatFromInt(common.width);
    const height: f64 = @floatFromInt(common.height);
    if (@abs(matrix[0] * @as(f64, @floatFromInt(p1.x)) - width) > 32 * std.math.floatEps(f64) * width or @abs(matrix[4] * @as(f64, @floatFromInt(p3.y)) - height) > 32 * std.math.floatEps(f64) * height) return error.UnsupportedAnchoredPictureProfile;
    return .{ .target = observed.target, .frame = .{ .width = common.width, .height = common.height, .horizontalOffset = common.offset_x, .verticalOffset = common.offset_y, .treatAsCharacter = false } };
}

pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, request: Request, ticket: epoch.Ticket, read_only: bool) !?[]u8 {
    if (request.target.selector.kind != .picture) return error.InvalidAnchoredPictureTarget;
    const current = try effective(a, raw, version, section, request.target.selector.node);
    defer a.free(current);
    const observed = try observeEffective(a, current, version, section, request.target.selector, ticket, read_only);
    if (!std.meta.eql(observed.target, request.target) or !std.meta.eql(observed.frame, request.expected)) return error.StaleAnchoredPictureTarget;
    const next = try after(observed.frame, request.width, request.height, request.anchor);
    if (std.meta.eql(next, observed.frame)) return null;
    const bytes = try @import("picture_resize_section.zig").write(a, current, version, request.target.selector.node, .{ next.width, next.height }, maximum);
    errdefer a.free(bytes);
    var tree = try @import("source_tree.zig").parse(a, current, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[request.target.control_node].record.framing;
    const at = record.offset + record.raw.len - record.payload.len;
    std.mem.writeInt(i32, bytes[at + 8 ..][0..4], next.verticalOffset, .little);
    std.mem.writeInt(i32, bytes[at + 12 ..][0..4], next.horizontalOffset, .little);
    return bytes;
}

/// All allocations finish before the caller publishes either the basis or this list.
pub fn withoutSelected(a: std.mem.Allocator, section: model.Section, picture: u32) !?[]model.PictureCurrentSize {
    const values = section.picture_current_sizes orelse return null;
    var count: usize = 0;
    for (values) |value| if (value.source_picture_node != picture) {
        count += 1;
    };
    if (count == 0) return null;
    const output = try a.alloc(model.PictureCurrentSize, count);
    var i: usize = 0;
    for (values) |value| if (value.source_picture_node != picture) {
        output[i] = value;
        i += 1;
    };
    return output;
}
