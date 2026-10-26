const std = @import("std");

test "chart ZIP candidate is atomic across every allocation failure" {
    const a = std.testing.allocator;
    const chart = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:numCache><c:ptCount val='1'/><c:pt idx='0'><c:v>4.30</c:v></c:pt></c:numCache></c:chartSpace>";
    const raw = try @import("../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = chart },
        .{ .name = "Contents", .parent = 0, .content = "opaque sibling" },
    }, .{});
    defer a.free(raw);
    const ole = try a.alloc(u8, raw.len + 4);
    defer a.free(ole);
    std.mem.writeInt(u32, ole[0..4], @intCast(raw.len), .little);
    @memcpy(ole[4..], raw);
    const fixture = @import("test_package_fixture.zig");
    const input = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='ole1' href='BinData/ole1.ole' media-type='application/ole'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
        .{ .name = "Chart/chart1.xml", .data = chart },
        .{ .name = "BinData/ole1.ole", .data = ole },
    });
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, baseline: []const u8) !void {
            defer std.testing.expectEqualSlices(u8, baseline, source) catch @panic("SourceChanged");
            var result = try @import("chart_zip_candidate.zig").prepare(allocator, source, "Chart/chart1.xml", "BinData/ole1.ole", &.{.{ .point = 0, .value = "6.70" }}, .{});
            defer result.deinit(allocator);
            try std.testing.expect(result.changed);
            try std.testing.expect(!std.mem.eql(u8, source, result.bytes));
        }
    }.run, .{ @as([]const u8, input), @as([]const u8, before) });
}
test "chart ZIP candidate changes both representations without mutating original" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Chart/chart1.xml").?, 4000000);
    defer a.free(xml);
    var tree = try @import("chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer values.deinit(a);
    var ordinal: ?usize = null;
    for (values.points, 0..) |point, index| if (point.kind == .numeric_cache) {
        ordinal = index;
        break;
    };
    const candidate = @import("chart_zip_candidate.zig");
    var result = try candidate.prepare(a, input, "Chart/chart1.xml", "BinData/ole1.ole", &.{.{ .point = ordinal.?, .value = "314.159" }}, .{});
    defer result.deinit(a);
    try std.testing.expect(result.changed);
    var noop = try candidate.prepare(a, input, "Chart/chart1.xml", "BinData/ole1.ole", &.{}, .{});
    defer noop.deinit(a);
    try std.testing.expect(!noop.changed);
    try std.testing.expectEqualSlices(u8, input, noop.bytes);
    try std.testing.expectError(error.MissingOleEntry, candidate.prepare(a, input, "Chart/chart1.xml", "BinData/missing.ole", &.{}, .{}));
    try std.testing.expectError(error.LimitExceeded, candidate.prepare(a, input, "Chart/chart1.xml", "BinData/ole1.ole", &.{}, .{ .max_output_bytes = 1 }));
    try std.testing.expectEqualSlices(u8, original, input);
}
