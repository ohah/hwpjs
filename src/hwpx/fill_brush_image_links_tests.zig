const std = @import("std");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const brushes = @import("fill_brush.zig");
const image_links = @import("fill_brush_image_links.zig");
const manifest = @import("content_manifest.zig");

const header_xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:borderFill><c:fillBrush>" ++
    "<c:imgBrush><c:img binaryItemIDRef='img&#49;'/></c:imgBrush>" ++
    "<c:imgBrush><c:img binaryItemIDRef='external'/></c:imgBrush>" ++
    "</c:fillBrush></h:borderFill></h:head>";
const section_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><c:fillBrush>" ++
    "<c:imgBrush><c:img binaryItemIDRef='BinData/img.png'/></c:imgBrush>" ++
    "<c:imgBrush><c:img binaryItemIDRef=''/></c:imgBrush>" ++
    "<c:imgBrush><c:img/></c:imgBrush>" ++
    "</c:fillBrush></s:sec>";

fn sampleManifest() manifest.Manifest {
    return .{
        .items = @constCast(&[_]manifest.Item{
            .{ .id = @constCast("img1"), .href = @constCast("BinData/img.png"), .media_type = @constCast("image/png"), .embedded = null, .entry_index = 7 },
            .{ .id = @constCast("external"), .href = @constCast("https://example.invalid/img.png"), .media_type = @constCast("image/png"), .embedded = false, .entry_index = null },
        }),
        .spine = @constCast(&[_]manifest.SpineRef{}),
        .xml_bytes = 0,
    };
}

fn inspect(a: std.mem.Allocator, options: image_links.Options) !image_links.Report {
    var header = try header_tree.parse(a, header_xml, 0, .{});
    defer header.deinit(a);
    var section = try section_tree.parse(a, section_xml, 0, 1, .{});
    defer section.deinit(a);
    var report = try brushes.inspect(a, &header, &.{section}, .{});
    defer report.deinit(a);
    return image_links.inspect(a, sampleManifest(), &report, options);
}

test "HWPX fill brush image links preserve all five exact OPF target states" {
    const a = std.testing.allocator;
    var report = try inspect(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), report.sites.len);
    inline for (.{ .embedded, .external, .missing, .empty, .absent }, 0..) |state, index| {
        try std.testing.expect(report.sites[index].target.state == state);
        try std.testing.expectEqual(@as(usize, 1), report.count(state));
    }
    try std.testing.expectEqual(@as(?usize, 0), report.sites[0].target.item_index);
    try std.testing.expectEqual(@as(?usize, 1), report.sites[1].target.item_index);
    try std.testing.expectEqual(@as(?usize, null), report.sites[2].target.item_index);
    try std.testing.expect(report.sites[0].part_kind == .header and report.sites[2].part_kind == .section);
    try std.testing.expectEqual(@as(?usize, 0), report.sites[2].section_ordinal);
    try std.testing.expectEqual(@as(usize, 0), report.sites[0].brush_index);
    try std.testing.expectEqual(@as(usize, 1), report.sites[2].brush_index);
}

test "HWPX fill brush image links enforce exact site budget and ancestry" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspect(a, .{ .max_sites = 4 }));
    var exact = try inspect(a, .{ .max_sites = 5 });
    exact.deinit(a);
    var header = try header_tree.parse(a, header_xml, 0, .{});
    defer header.deinit(a);
    var section = try section_tree.parse(a, section_xml, 0, 1, .{});
    defer section.deinit(a);
    var raw = try brushes.inspect(a, &header, &.{section}, .{});
    defer raw.deinit(a);
    raw.nodes[1].parent_node_index = 999;
    try std.testing.expectError(error.InvalidBrushReport, image_links.inspect(a, sampleManifest(), &raw, .{}));
    raw.nodes[1].parent_node_index = 0;
    raw.nodes[1].element_index = raw.nodes[0].element_index;
    try std.testing.expectError(error.InvalidBrushReport, image_links.inspect(a, sampleManifest(), &raw, .{}));
}

test "HWPX fill brush image links release every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 5), report.sites.len);
        }
    }.run, .{});
}
