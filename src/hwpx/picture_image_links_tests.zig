const std = @import("std");
const section_tree = @import("section_tree.zig");
const part_tree = @import("xml_part_tree.zig");
const links = @import("picture_image_links.zig");
const manifest = @import("content_manifest.zig");
const package = @import("package.zig");

const section_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'>" ++
    "<p:p><p:run><p:pic><c:img binaryItemIDRef='img&#49;'/><c:img binaryItemIDRef='external'/><c:img binaryItemIDRef='missing'/><c:img binaryItemIDRef=''/><c:img/><x:img binaryItemIDRef='img1'/><p:container><c:img binaryItemIDRef='img1'/></p:container></p:pic></p:run></p:p>" ++
    "<x:pic><c:img binaryItemIDRef='img1'/></x:pic><p:other><c:img binaryItemIDRef='img1'/></p:other></s:sec>";

fn sampleManifest() manifest.Manifest {
    return .{
        .items = @constCast(&[_]manifest.Item{
            .{ .id = @constCast("img1"), .href = @constCast("BinData/image.png"), .media_type = @constCast("image/png"), .embedded = null, .entry_index = 7 },
            .{ .id = @constCast("external"), .href = @constCast("https://example.invalid/pic.png"), .media_type = @constCast("image/png"), .embedded = false, .entry_index = null },
        }),
        .spine = @constCast(&[_]manifest.SpineRef{}),
        .xml_bytes = 0,
    };
}

fn inspect(a: std.mem.Allocator, options: links.Options) !links.Report {
    var tree = try section_tree.parse(a, section_xml, 0, 3, .{});
    defer tree.deinit(a);
    return links.inspectSections(a, sampleManifest(), &.{tree}, options);
}

test "HWPX picture image links resolve five states and direct namespaced children" {
    const a = std.testing.allocator;
    var report = try inspect(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), report.sites.len);
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    inline for (.{ .embedded, .external, .missing, .empty, .absent }, 0..) |state, n| {
        try std.testing.expect(report.sites[n].target.state == state);
        try std.testing.expectEqual(@as(usize, 1), report.count(state));
        try std.testing.expectEqual(@as(usize, 3), report.sites[n].part_item_index);
        try std.testing.expectEqual(@as(?usize, 0), report.sites[n].section_ordinal);
        try std.testing.expect(report.sites[n].picture_element_index < report.sites[n].image_element_index);
    }
    try std.testing.expectEqual(@as(?usize, 0), report.sites[0].target.item_index);
    try std.testing.expectEqual(@as(?usize, 1), report.sites[1].target.item_index);
    try std.testing.expectEqual(@as(?usize, null), report.sites[2].target.item_index);
    try std.testing.expectEqualStrings("img1", report.sites[0].id.?);
    try std.testing.expectEqualStrings("external", report.sites[1].id.?);
    try std.testing.expectEqualStrings("missing", report.sites[2].id.?);
    try std.testing.expectEqualStrings("", report.sites[3].id.?);
    try std.testing.expect(report.sites[4].id == null);
}

test "HWPX picture image links enforce site and attribute limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspect(a, .{ .max_sites = 4 }));
    var exact = try inspect(a, .{ .max_sites = 5 });
    exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, inspect(a, .{ .max_attribute_bytes = 7 }));
    var exact_id = try inspect(a, .{ .max_attribute_bytes = 8 });
    exact_id.deinit(a);
    var tree = try section_tree.parse(a, section_xml, 0, 3, .{});
    defer tree.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").core_uri, "img")) {
            tree.elements[index].parent = index;
            break;
        }
    }
    try std.testing.expectError(error.InvalidPartTree, links.inspectSections(a, sampleManifest(), &.{tree}, .{}));
}

test "HWPX picture image links distinguish raw master scope" {
    const a = std.testing.allocator;
    const source = "<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'>" ++
        "<p:pic><c:img binaryItemIDRef='img1'/></p:pic><p:subList><p:p><p:run><p:pic><c:img binaryItemIDRef='external'/></p:pic></p:run></p:p></p:subList></masterPage>";
    var tree = try part_tree.parse(a, source, .master_page, 0, 9, .{});
    defer tree.deinit(a);
    var report = try links.inspectMasterTrees(a, sampleManifest(), &.{tree}, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.sites.len);
    try std.testing.expectEqual(@as(usize, 1), report.master_pages);
    try std.testing.expectEqual(@as(usize, 1), report.count(.embedded));
    try std.testing.expectEqual(@as(usize, 1), report.count(.external));
    try std.testing.expect(report.sites[0].part_kind == .master_page);
    try std.testing.expectEqual(@as(?usize, null), report.sites[0].section_ordinal);
}

test "HWPX picture image links release every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 5), report.sites.len);
        }
    }.run, .{});
}

test "HWPX picture image links release master tree allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const source = "<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:pic><c:img binaryItemIDRef='img1'/></p:pic></masterPage>";
            var tree = try part_tree.parse(a, source, .master_page, 0, 9, .{});
            defer tree.deinit(a);
            var report = try links.inspectMasterTrees(a, sampleManifest(), &.{tree}, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), report.count(.embedded));
        }
    }.run, .{});
}

test "HWPX picture image links resolve tracked picture document" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var trees = try document.readXmlTrees(a, .{});
    defer trees.deinit(a);
    var report = try links.inspectSections(a, document.manifest, trees.sections, .{});
    defer report.deinit(a);
    try std.testing.expect(report.sites.len > 0);
    try std.testing.expectEqual(report.sites.len, report.count(.embedded) + report.count(.external) + report.count(.empty));
    for (report.sites) |site| {
        if (site.target.item_index) |item_index| try std.testing.expect(item_index < document.manifest.items.len);
    }
    var standalone = try document.inspectPictureImageLinks(a, .{});
    defer standalone.deinit(a);
    try std.testing.expectEqual(report.sites.len, standalone.sites.len);
    try std.testing.expectEqual(report.count(.embedded), standalone.count(.embedded));
    try std.testing.expectError(error.LimitExceeded, document.inspectPictureImageLinks(a, .{ .links = .{ .max_sites = 0 } }));
}
