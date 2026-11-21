//! HWP5 table69 outer margins only. Picture crop/body insets and all transforms stay owned elsewhere.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const epoch = @import("../../model/history_mutation_epoch.zig");
const common = @import("../body/object_common.zig");
const component = @import("../body/shape_component.zig");
pub const Kind = enum { picture, textbox };
pub const Selector = struct { section: u32, kind: Kind, node: u32 };
/// Physical nodes and current anchor bind independently of instance ID or display coordinates.
pub const Target = struct {
    selector: Selector,
    control_node: u32,
    component_node: u32,
    paragraph_node: u32,
    paragraph: u32,
    anchor_unit: u32,
    instance_id: u32,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
};
pub const Table70Name = enum { square, tight, through, top_and_bottom, behind_text, in_front_of_text, reserved };
pub fn table70Name(raw: u3) Table70Name {
    return switch (raw) {
        0 => .square,
        1 => .tight,
        2 => .through,
        3 => .top_and_bottom,
        4 => .behind_text,
        5 => .in_front_of_text,
        6, 7 => .reserved,
    };
}
pub const Observation = struct {
    target: Target,
    /// Table69 source order. Signed words, never picture-payload inset/crop values.
    margins: [4]i16,
    flags: u32,
    wrap_ordinal: u3,
    table70_name: Table70Name,
    current_renderer_margin_policy: enum { square_exclusion, compact_vertical_exclusion, no_exclusion, inline_unverified, unsupported },
    treat_as_character: bool,
    editable: bool,
    reason: ?[]const u8,
};
pub const Request = struct { target: Target, expected: [4]i16, margins: [4]i16 };

const Policy = enum { square_v1, observed_vertical_v1 };
/// Legacy Square-v1 admission stays independent of the new negotiated policy.
pub fn read(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, selector: Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    return readPolicy(a, raw, version, current, selector, ticket, read_only, .square_v1);
}
/// Observed compact raw1 whole-line exclusion. This is not official Tight support.
pub fn readObservedVertical(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, selector: Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    return readPolicy(a, raw, version, current, selector, ticket, read_only, .observed_vertical_v1);
}
fn readPolicy(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, selector: Selector, ticket: epoch.Ticket, read_only: bool, policy: Policy) !Observation {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (selector.node >= tree.nodes.len) return error.InvalidOuterMarginTarget;
    var selected_component: usize = selector.node;
    if (selector.kind == .picture) {
        if (tree.nodes[selector.node].record.framing.tag != @import("../body/shape_picture.zig").tag) return error.InvalidOuterMarginTarget;
        selected_component = tree.nodes[selector.node].parent orelse return error.InvalidOuterMarginTarget;
        const selected = try @import("../body/owned_record.zig").componentChild(tree, selected_component, @import("../body/control_rules.zig").id("$pic"), @import("../body/shape_picture.zig").tag);
        if (selected != selector.node) return error.InvalidOuterMarginTarget;
    }
    const sources = try @import("drawing_sources.zig").read(a, raw, version);
    defer a.free(sources);
    var selected: ?@import("drawing_sources.zig").Source = null;
    for (sources) |source| if (source.component_node == selected_component) {
        if (selected != null) return error.AmbiguousOuterMarginOwner;
        selected = source;
    };
    const source = selected orelse return error.InvalidOuterMarginTarget;
    if (source.kind_id != (if (selector.kind == .picture) @import("../body/control_rules.zig").id("$pic") else @import("../body/control_rules.zig").id("$rec"))) return error.InvalidOuterMarginTarget;
    if (tree.nodes[selected_component].parent != source.control_node) return error.UnsupportedOuterMarginGroup;
    const anchors = try @import("drawing_anchor_positions.zig").read(a, raw, version, current.paragraphs);
    defer a.free(anchors);
    var host: ?@import("drawing_anchor_positions.zig").Anchor = null;
    for (anchors) |anchor| if (anchor.component_node == selected_component and anchor.control_node == source.control_node) {
        if (host != null) return error.AmbiguousOuterMarginOwner;
        host = anchor;
    };
    const anchor = host orelse return error.MissingOuterMarginAnchor;
    if (anchor.paragraph >= current.paragraphs.len or current.paragraphs[anchor.paragraph].parent_node != null) return error.UnsupportedOuterMarginHost;
    const shape = try component.Component.parse(tree.nodes[selected_component].record.framing.payload, .double_id);
    if (shape.group_count != 0) return error.UnsupportedOuterMarginGroup;
    const bodies = try @import("drawing_list_sources.zig").read(a, raw, version);
    defer a.free(bodies);
    var caption = false;
    for (bodies) |body| if (body.control_node == source.control_node and body.kind == .caption) {
        caption = true;
    };
    var simple = true;
    if (selector.kind == .textbox) {
        var count: usize = 0;
        for (bodies) |body| if (body.kind == .body and body.owner_node == selected_component and body.control_node == source.control_node) {
            count += 1;
        };
        if (count != 1) return error.MissingOuterMarginTextOwner;
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        // Same simple-textbox transform admission as the existing geometry writer.
        simple = shape.rotation_angle == 0 and !shape.horizontalFlip() and !shape.verticalFlip() and shape.offset_x == 0 and shape.offset_y == 0 and matrix[0] > 0 and matrix[4] > 0 and matrix[1] == 0 and matrix[2] == 0 and matrix[3] == 0 and matrix[5] == 0;
    }
    const properties = try common.parseControl(tree.nodes[source.control_node].record.value.control_header);
    const ordinal: u3 = @intCast((properties.flags >> 21) & 7);
    const inline_object = properties.flags & 1 != 0;
    if (policy == .observed_vertical_v1 and selector.kind == .picture) {
        // The new picture cohort does not admit unverified rotated/scaled wrap bounds.
        // Existing Square picture admission is deliberately unchanged.
        const matrix = try @import("../body/rendering_affine.zig").compose(shape.rendering);
        simple = shape.rotation_angle == 0 and !shape.horizontalFlip() and !shape.verticalFlip() and shape.offset_x == 0 and shape.offset_y == 0 and matrix[0] == 1 and matrix[1] == 0 and matrix[2] == 0 and matrix[3] == 0 and matrix[4] == 1 and matrix[5] == 0;
    }
    // This is the CURRENT compact renderer policy, not an encoding detector and
    // not the Table70 name above. Square-v1 admits raw0; the separate observed vertical policy admits raw1.
    const renderer_flags_supported = properties.flags & 0xc0000002 == 0 and ((properties.flags >> 3) & 3) <= 2 and ((properties.flags >> 5) & 7) <= 4 and ((properties.flags >> 10) & 7) <= 4 and ordinal <= 3;
    const supported_wrap = renderer_flags_supported and !inline_object and ordinal == @as(u3, if (policy == .square_v1) 0 else 1);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, current);
    defer a.free(spans);
    const end = try std.math.add(u32, anchor.current_unit, 8);
    var protected = false;
    for (spans) |span| {
        const before_end = span.begin.paragraph < anchor.paragraph or (span.begin.paragraph == anchor.paragraph and span.begin.unit < end);
        const after_start = span.end.paragraph > anchor.paragraph or (span.end.paragraph == anchor.paragraph and span.end.unit > anchor.current_unit);
        if (before_end and after_start) protected = true;
    }
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    const reason: ?[]const u8 = if (read_only or protected) "OuterMarginsReadOnly" else if (!simple) "UnsupportedOuterMarginTransform" else if (!common.hasAbsoluteDimensions(properties.flags)) "UnsupportedOuterMarginRelativeSize" else if (!renderer_flags_supported) "UnsupportedOuterMarginRendererFlags" else if (inline_object) "OuterMarginsInlineEffectUnverified" else if (ordinal == 1 and policy == .square_v1) "OuterMarginsTopBottomFollowUpRequired" else if (!supported_wrap) (if (policy == .square_v1) "OuterMarginsNoCurrentExclusionEffect" else "VerticalMarginsRequiresObservedRaw1") else if (caption or properties.hasCaption()) "UnsupportedOuterMarginCaptionFlow" else null;
    return .{ .target = .{ .selector = selector, .control_node = @intCast(source.control_node), .component_node = @intCast(selected_component), .paragraph_node = @intCast(source.paragraph_node), .paragraph = @intCast(anchor.paragraph), .anchor_unit = anchor.current_unit, .instance_id = properties.instance_id, .source_sha256 = digest, .ticket = ticket }, .margins = properties.margins, .flags = properties.flags, .wrap_ordinal = ordinal, .table70_name = table70Name(ordinal), .current_renderer_margin_policy = if (!renderer_flags_supported) .unsupported else if (inline_object) .inline_unverified else switch (ordinal) {
        0 => .square_exclusion,
        1 => .compact_vertical_exclusion,
        2, 3 => .no_exclusion,
        else => .unsupported,
    }, .treat_as_character = inline_object, .editable = reason == null, .reason = reason };
}

/// Only eight bytes change. Topology, offsets, line-cache bytes and all opaque tails stay exact.
pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, request: Request, ticket: epoch.Ticket, read_only: bool) !?[]u8 {
    return writePolicy(a, raw, version, current, request, ticket, read_only, .square_v1);
}
pub fn writeObservedVertical(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, request: Request, ticket: epoch.Ticket, read_only: bool) !?[]u8 {
    return writePolicy(a, raw, version, current, request, ticket, read_only, .observed_vertical_v1);
}
fn writePolicy(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, request: Request, ticket: epoch.Ticket, read_only: bool, policy: Policy) !?[]u8 {
    const observed = try readPolicy(a, raw, version, current, request.target.selector, ticket, read_only, policy);
    if (!std.meta.eql(observed.target, request.target) or !std.meta.eql(observed.margins, request.expected)) return error.StaleOuterMarginTarget;
    if (!observed.editable) return error.OuterMarginsReadOnly;
    if (policy == .observed_vertical_v1) {
        if (request.margins[0] != observed.margins[0] or request.margins[1] != observed.margins[1]) return error.VerticalMarginsHorizontalChangeForbidden;
        for (2..4) |i| if (request.margins[i] < 0 and request.margins[i] != observed.margins[i]) return error.InvalidVerticalMargin;
    }
    if (std.meta.eql(observed.margins, request.margins)) return null;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[observed.target.control_node].record.framing;
    const offset = record.offset + record.raw.len - record.payload.len + 28;
    if (offset > raw.len or raw.len - offset < 8) return error.InvalidOuterMarginTarget;
    const output = try a.dupe(u8, raw);
    for (request.margins, 0..) |value, i| {
        if (policy == .observed_vertical_v1 and i < 2) continue;
        std.mem.writeInt(i16, output[offset + i * 2 ..][0..2], value, .little);
    }
    return output;
}
