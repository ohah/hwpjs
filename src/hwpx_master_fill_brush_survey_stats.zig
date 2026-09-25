const std = @import("std");
const package = @import("hwpx/package.zig");

pub const Stats = struct {
    parts: usize = 0,
    brushes: usize = 0,
    face_sum: u64 = 0,
    hatch_sum: u64 = 0,

    pub fn from(report: package.MasterPageFillBrushReport, pages: package.MasterPageReport) !Stats {
        try std.testing.expectEqual(@as(usize, 0), report.header_and_sections);
        try std.testing.expectEqual(pages.parts.parts.len, report.master_pages);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes + report.unknown_enums + report.non_six_hex_colors + report.color_count_mismatch);
        try std.testing.expectEqual(report.brushes.len, report.count(.win_brush));
        try std.testing.expectEqual(@as(usize, 0), report.count(.gradation) + report.count(.img_brush) + report.count(.color) + report.count(.image));
        try std.testing.expectEqual(report.brushes.len, report.direct_children);
        var stats: Stats = .{ .parts = report.master_pages, .brushes = report.brushes.len };
        var attribute_bytes: usize = 0;
        for (report.brushes, report.nodes) |brush, node| {
            try std.testing.expect(brush.part_kind == .master_page);
            try std.testing.expectEqual(@as(?usize, null), brush.section_ordinal);
            try std.testing.expect(brush.parent_element_index != null);
            try std.testing.expectEqual(@as(usize, 1), brush.direct_children);
            try std.testing.expectEqual(@as(usize, 1), brush.count(.win_brush));
            var found = false;
            for (pages.parts.parts) |part| found = found or brush.part_item_index == part.item_index;
            try std.testing.expect(found);
            try std.testing.expect(node.kind == .win_brush);
            try std.testing.expectEqual(@as(?usize, null), node.parent_node_index);
            try std.testing.expectEqual(@as(usize, 0), node.direct_children + node.other_attributes + node.unknown_enums);
            try std.testing.expect(node.get(.hatch_style) == null);
            try std.testing.expectEqualStrings("0", node.get(.win_alpha) orelse return error.MissingBrushAlpha);
            attribute_bytes += node.attribute_bytes;
            stats.face_sum += try sixHex(node.get(.face_color) orelse return error.MissingBrushFaceColor);
            stats.hatch_sum += try sixHex(node.get(.hatch_color) orelse return error.MissingBrushHatchColor);
        }
        try std.testing.expectEqual(report.attribute_bytes, attribute_bytes);
        return stats;
    }

    pub fn merge(self: *Stats, other: Stats) void {
        self.parts += other.parts;
        self.brushes += other.brushes;
        self.face_sum += other.face_sum;
        self.hatch_sum += other.hatch_sum;
    }
};

fn sixHex(raw: []const u8) !u32 {
    if (raw.len != 7 or raw[0] != '#') return error.UnexpectedColorSpelling;
    for (raw[1..]) |byte| if (!std.ascii.isHex(byte)) return error.UnexpectedColorSpelling;
    return std.fmt.parseInt(u32, raw[1..], 16) catch return error.UnexpectedColorSpelling;
}
