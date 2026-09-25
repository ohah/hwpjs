const std = @import("std");
const package = @import("hwpx/package.zig");
const values = @import("hwpx/xml_values.zig");

pub const Stats = struct {
    brushes: usize = 0,
    header_brushes: usize = 0,
    nodes: [5]usize = @splat(0),
    direct_children: usize = 0,
    non_six_hex_colors: usize = 0,
    multiple_variants: usize = 0,
    missing_hatch_style: usize = 0,
    missing_color_num: usize = 0,
    color_markers: [2]usize = @splat(0),
    numeric_sums: [8]i64 = @splat(0),
    gradation_types: [4]usize = @splat(0),
    image_modes: [5]usize = @splat(0),
    image_effects: [2]usize = @splat(0),
    hatch_styles: [3]usize = @splat(0),

    pub fn from(a: std.mem.Allocator, report: package.FillBrushReport, presentation: package.SectionPresentationReport) !Stats {
        try std.testing.expectEqual(presentation.sections + 1, report.header_and_sections);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes + report.unknown_enums + report.color_count_mismatch);
        const seen_brush = try a.alloc([3]usize, report.brushes.len);
        defer a.free(seen_brush);
        for (seen_brush) |*entry| entry.* = @splat(0);
        const seen_node = try a.alloc(usize, report.nodes.len);
        defer a.free(seen_node);
        @memset(seen_node, 0);
        var stats: Stats = .{};
        for (report.brushes) |brush| {
            stats.brushes += 1;
            if (brush.part_kind == .header) {
                stats.header_brushes += 1;
                try std.testing.expectEqual(@as(?usize, null), brush.section_ordinal);
            } else {
                try std.testing.expect(brush.part_kind == .section);
                try std.testing.expect(brush.section_ordinal != null and brush.section_ordinal.? < presentation.sections);
            }
            try std.testing.expect(brush.parent_element_index != null);
            try std.testing.expectEqual(@as(usize, 0), brush.other_attributes);
            stats.direct_children += brush.direct_children;
            const variants = brush.count(.win_brush) + brush.count(.gradation) + brush.count(.img_brush);
            try std.testing.expectEqual(variants, brush.direct_children);
            stats.multiple_variants += @intFromBool(variants > 1);
        }
        for (report.nodes, 0..) |node, node_index| {
            try std.testing.expect(node.brush_index < report.brushes.len);
            try std.testing.expect(node.element_index > report.brushes[node.brush_index].element_index);
            try std.testing.expectEqual(@as(usize, 0), node.other_attributes + node.unknown_enums);
            stats.nodes[@intFromEnum(node.kind)] += 1;
            stats.direct_children += node.direct_children;
            stats.non_six_hex_colors += node.non_six_hex_colors;
            switch (node.kind) {
                .win_brush, .gradation, .img_brush => {
                    try std.testing.expectEqual(@as(?usize, null), node.parent_node_index);
                    seen_brush[node.brush_index][@intFromEnum(node.kind)] += 1;
                },
                .color, .image => {
                    const parent_index = node.parent_node_index orelse return error.MissingBrushParent;
                    try std.testing.expect(parent_index < node_index);
                    const parent = report.nodes[parent_index];
                    try std.testing.expectEqual(node.brush_index, parent.brush_index);
                    try std.testing.expect((node.kind == .color and parent.kind == .gradation) or (node.kind == .image and parent.kind == .img_brush));
                    seen_node[parent_index] += 1;
                    try std.testing.expectEqual(@as(usize, 0), node.direct_children);
                },
            }
            switch (node.kind) {
                .win_brush => try addWin(&stats, &node),
                .gradation => try addGradation(&stats, &node),
                .img_brush => try addImageMode(&stats, &node),
                .color => try addColor(&stats, &node),
                .image => try addImage(&stats, &node),
            }
        }
        for (report.brushes, seen_brush) |brush, seen| try std.testing.expectEqualSlices(usize, &brush.child_counts, &seen);
        for (report.nodes, seen_node) |node, seen| try std.testing.expectEqual(node.recognized_children, seen);
        for (presentation.fill_brushes) |linked| {
            var matched: usize = 0;
            for (report.brushes) |brush| {
                matched += @intFromBool(brush.part_kind == .section and brush.section_ordinal == linked.section_ordinal and brush.element_index == linked.element_index);
            }
            try std.testing.expectEqual(@as(usize, 1), matched);
        }
        try std.testing.expectEqualSlices(usize, &report.kind_counts, &stats.nodes);
        try std.testing.expectEqual(report.direct_children, stats.direct_children);
        try std.testing.expectEqual(report.non_six_hex_colors, stats.non_six_hex_colors);
        return stats;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        inline for (.{ "brushes", "header_brushes", "direct_children", "non_six_hex_colors", "multiple_variants", "missing_hatch_style", "missing_color_num" }) |field| @field(self, field) += @field(other, field);
        inline for (.{ "nodes", "color_markers", "numeric_sums", "gradation_types", "image_modes", "image_effects", "hatch_styles" }) |field| {
            for (&@field(self, field), @field(other, field)) |*slot, value| slot.* += value;
        }
    }
};

fn required(node: *const @import("hwpx/fill_brush.zig").Node, field: @import("hwpx/fill_brush.zig").Field) ![]const u8 {
    return node.get(field) orelse error.MissingBrushField;
}

fn sixHex(raw: []const u8) bool {
    if (raw.len != 7 or raw[0] != '#') return false;
    for (raw[1..]) |byte| if (!std.ascii.isHex(byte)) return false;
    return true;
}

fn eightHex(raw: []const u8) bool {
    if (raw.len != 9 or raw[0] != '#') return false;
    for (raw[1..]) |byte| if (!std.ascii.isHex(byte)) return false;
    return true;
}

fn addWin(stats: *Stats, node: *const @import("hwpx/fill_brush.zig").Node) !void {
    try std.testing.expectEqual(@as(usize, 0), node.direct_children);
    const face = try required(node, .face_color);
    const hatch = try required(node, .hatch_color);
    stats.color_markers[0] += @intFromBool(std.mem.eql(u8, face, "none"));
    stats.color_markers[1] += @intFromBool(eightHex(hatch));
    try std.testing.expect(sixHex(face) or eightHex(face) or std.mem.eql(u8, face, "none"));
    try std.testing.expect(sixHex(hatch) or eightHex(hatch) or std.mem.eql(u8, hatch, "none"));
    try std.testing.expectEqualStrings("0", try required(node, .win_alpha));
    if (node.get(.hatch_style)) |style| {
        const slot: usize = if (std.mem.eql(u8, style, "VERTICAL")) 0 else if (std.mem.eql(u8, style, "BACK_SLASH")) 1 else if (std.mem.eql(u8, style, "CROSS_DIAGONAL")) 2 else return error.UnexpectedHatchStyle;
        stats.hatch_styles[slot] += 1;
    } else stats.missing_hatch_style += 1;
}

fn addGradation(stats: *Stats, node: *const @import("hwpx/fill_brush.zig").Node) !void {
    try std.testing.expectEqual(@as(usize, 2), node.direct_children);
    try std.testing.expectEqual(@as(usize, 2), node.recognized_children);
    const kind = try required(node, .gradation_type);
    const slot: usize = if (std.mem.eql(u8, kind, "LINEAR")) 0 else if (std.mem.eql(u8, kind, "RADIAL")) 1 else if (std.mem.eql(u8, kind, "CONICAL")) 2 else if (std.mem.eql(u8, kind, "SQUARE")) 3 else return error.UnexpectedGradationType;
    stats.gradation_types[slot] += 1;
    inline for (.{ .angle, .center_x, .center_y, .step }, 0..) |field, index| stats.numeric_sums[index] += try values.signed32(try required(node, field));
    if (node.get(.color_num)) |raw| {
        stats.numeric_sums[4] += try values.unsigned32(raw);
    } else stats.missing_color_num += 1;
    stats.numeric_sums[5] += try values.signed32(try required(node, .step_center));
    try std.testing.expectEqualStrings("0", try required(node, .gradation_alpha));
}

fn addImageMode(stats: *Stats, node: *const @import("hwpx/fill_brush.zig").Node) !void {
    try std.testing.expectEqual(@as(usize, 1), node.direct_children);
    try std.testing.expectEqual(@as(usize, 1), node.recognized_children);
    const mode = try required(node, .image_mode);
    const slot: usize = if (std.mem.eql(u8, mode, "TOTAL")) 0 else if (std.mem.eql(u8, mode, "CENTER")) 1 else if (std.mem.eql(u8, mode, "TILE_VERT_RIGHT")) 2 else if (std.mem.eql(u8, mode, "ZOOM")) 3 else if (std.mem.eql(u8, mode, "TILE")) 4 else return error.UnexpectedImageMode;
    stats.image_modes[slot] += 1;
}

fn addColor(_: *Stats, node: *const @import("hwpx/fill_brush.zig").Node) !void {
    try std.testing.expect(sixHex(try required(node, .color_value)));
}

fn addImage(stats: *Stats, node: *const @import("hwpx/fill_brush.zig").Node) !void {
    try std.testing.expect((try required(node, .binary_item_id_ref)).len != 0);
    stats.numeric_sums[6] += try values.signed32(try required(node, .bright));
    stats.numeric_sums[7] += try values.signed32(try required(node, .contrast));
    const effect = try required(node, .image_effect);
    const slot: usize = if (std.mem.eql(u8, effect, "REAL_PIC")) 0 else if (std.mem.eql(u8, effect, "GRAY_SCALE")) 1 else return error.UnexpectedImageEffect;
    stats.image_effects[slot] += 1;
    try std.testing.expectEqualStrings("0", try required(node, .image_alpha));
}
