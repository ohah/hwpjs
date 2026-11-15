//! Raw family scalars + conservative source coverage. No effective defaults.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const Kind = @import("chart_plot_kind.zig").Kind;
const scalar = @import("chart_scalar_field.zig");
const uri = @import("chart_namespace.zig").uri;
pub const RadarStyle = enum { standard, marker, filled };
pub const SizeRepresents = enum { area, w };

fn bounded(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize, slot: *?scalar.Field(u32), minimum: u32, maximum: u32) !void {
    if (slot.* != null) return error.DuplicateChartFamilySetting;
    const value = try scalar.read(u32, a, tree, node, limit, error.InvalidChartFamilySetting);
    if (value.value) |number| if (number < minimum or number > maximum) return error.InvalidChartFamilySetting;
    slot.* = value;
}
fn typed(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize, slot: *?scalar.Field(T)) !void {
    if (slot.* != null) return error.DuplicateChartFamilySetting;
    slot.* = try scalar.read(T, a, tree, node, limit, error.InvalidChartFamilySetting);
}
fn audited(kind: Kind) bool {
    return kind == .doughnutChart or kind == .radarChart or kind == .bubbleChart or kind == .surfaceChart or kind == .surface3DChart;
}
fn known(tree: *const Tree, node: usize, comptime names: anytype) bool {
    inline for (names) |name| if (tree.elements[node].is(uri, name)) return true;
    return false;
}

/// Audit literal data/text envelopes too: delegated numeric/text parsing must
/// not turn an ignored extension/point override into false family coverage.
/// References/multilevel data are conservatively unparsed in this v1 subset.
fn dataUnparsed(tree: *const Tree, node: usize) bool {
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const allowed = if (known(tree, node, .{"tx"}))
            known(tree, index, .{"v"})
        else if (known(tree, node, .{"cat"}))
            known(tree, index, .{ "strLit", "numLit" })
        else if (known(tree, node, .{ "val", "xVal", "yVal", "bubbleSize" }))
            known(tree, index, .{"numLit"})
        else if (known(tree, node, .{"strLit"}))
            known(tree, index, .{ "ptCount", "pt" })
        else if (known(tree, node, .{"numLit"}))
            known(tree, index, .{ "formatCode", "ptCount", "pt" })
        else if (known(tree, node, .{"pt"}))
            known(tree, index, .{"v"})
        else
            false;
        if (!allowed or dataUnparsed(tree, index)) return true;
    }
    return false;
}

/// Marker source admitted by the current radar preview: explicit circle only.
/// Other marker sizes/symbols/properties remain visible as unparsed coverage.
fn circleMarker(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !bool {
    const child = tree.elements[node].first_child orelse return false;
    if (!tree.elements[child].is(uri, "symbol") or tree.elements[child].next_sibling != null or tree.elements[child].first_child != null) return false;
    const raw = try tree.attributeValue(a, child, "", "val") orelse return false;
    const text = try raw.toUtf8(a, limit);
    defer a.free(text);
    return std.mem.eql(u8, text, "circle");
}

fn seriesUnparsed(a: std.mem.Allocator, tree: *const Tree, series: usize, kind: Kind, limit: usize) !bool {
    var unparsed = false;
    var child = tree.elements[series].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (known(tree, node, .{ "idx", "order" })) {
            if (tree.elements[node].first_child != null) unparsed = true;
            continue;
        }
        if (known(tree, node, .{"tx"}) or
            (kind == .bubbleChart and known(tree, node, .{ "xVal", "yVal", "bubbleSize" })) or
            (kind != .bubbleChart and known(tree, node, .{ "cat", "val" })))
        {
            if (dataUnparsed(tree, node)) unparsed = true;
            continue;
        }
        if (kind == .radarChart and tree.elements[node].is(uri, "marker")) {
            if (!try circleMarker(a, tree, node, limit)) unparsed = true;
            continue;
        }
        // Includes dPt (and bubble3D at point scope), series bubble3D,
        // explosion/style overrides, invertIfNegative, extensions, labels, etc.
        unparsed = true;
    }
    return unparsed;
}

/// The output fields are flattened into chart_plot_settings.Settings.
pub fn read(a: std.mem.Allocator, tree: *const Tree, plot: usize, limit: usize, output: anytype) !void {
    const kind = @import("chart_plot_kind.zig").selected(tree, plot) orelse return error.InvalidChartPlot;
    const supported = audited(kind);
    output.family_unparsed_children = if (supported) false else null;
    var child = tree.elements[plot].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(uri, "holeSize")) {
            if (kind != .doughnutChart) return error.InvalidChartFamilySetting;
            try bounded(a, tree, node, limit, &output.hole_size, 10, 90);
        } else if (element.is(uri, "radarStyle")) {
            if (kind != .radarChart) return error.InvalidChartFamilySetting;
            try typed(RadarStyle, a, tree, node, limit, &output.radar_style);
        } else if (element.is(uri, "bubbleScale")) {
            if (kind != .bubbleChart) return error.InvalidChartFamilySetting;
            try bounded(a, tree, node, limit, &output.bubble_scale, 0, 300);
        } else if (element.is(uri, "sizeRepresents")) {
            if (kind != .bubbleChart) return error.InvalidChartFamilySetting;
            try typed(SizeRepresents, a, tree, node, limit, &output.size_represents);
        } else if (element.is(uri, "showNegBubbles")) {
            if (kind != .bubbleChart) return error.InvalidChartFamilySetting;
            try typed(bool, a, tree, node, limit, &output.show_negative_bubbles);
        } else if (element.is(uri, "bubble3D")) {
            if (kind != .bubbleChart) return error.InvalidChartFamilySetting;
            try typed(bool, a, tree, node, limit, &output.bubble_3d);
        } else if (element.is(uri, "wireframe")) {
            if (kind != .surfaceChart and kind != .surface3DChart) return error.InvalidChartFamilySetting;
            try typed(bool, a, tree, node, limit, &output.wireframe);
        } else if (supported) {
            if (element.is(uri, "ser")) {
                if (try seriesUnparsed(a, tree, node, kind, limit)) output.family_unparsed_children = true;
            } else if (element.is(uri, "axId")) {
                if (kind == .doughnutChart) output.family_unparsed_children = true;
            } else if (element.is(uri, "varyColors")) {
                if (kind == .surfaceChart or kind == .surface3DChart) output.family_unparsed_children = true;
            } else if (element.is(uri, "firstSliceAng") and kind == .doughnutChart) {
                // Parsed by the shared plot owner.
            } else output.family_unparsed_children = true;
        }
    }
}
