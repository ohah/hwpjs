const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const read = @import("paragraph_id_source_parts.zig").read;

test "HWPX paragraph ID source parts release transient ownership on allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    try std.testing.expectError(error.LimitExceeded, read(a, input, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const parts = try read(allocator, bytes, 4_000_000);
            defer {
                for (parts) |*tree| tree.deinit(allocator);
                allocator.free(parts);
            }
            try std.testing.expectEqual(@as(usize, 1), parts.len);
            try std.testing.expectEqual(tree_module.PartKind.header, parts[0].part_kind);
        }
    }.run, .{input});
}

test "HWPX paragraph ID source parts avoid master page collision in actual session save" {
    const a = std.testing.allocator;
    const fixture = @import("test_package_fixture.zig");
    const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p id='1'><p:run><p:t>마스터</p:t></p:run></p:p></p:subList></masterPage>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='3'><p:run><p:t>AB</p:t></p:run></p:p></s:sec>" },
        .{ .name = "Contents/masterpage0.xml", .data = master },
    };
    const input = try fixture.storedZip(a, &sources);
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const parts = try read(allocator, bytes, 10000);
            defer {
                for (parts) |*tree| tree.deinit(allocator);
                allocator.free(parts);
            }
            try std.testing.expectEqual(@as(usize, 2), parts.len);
            try std.testing.expectEqual(tree_module.PartKind.master_page, parts[1].part_kind);
            try std.testing.expectEqual(@as(?usize, null), parts[1].section_ordinal);
        }
    }.run, .{input});
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var current = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer current.deinit();
            _ = current.splitParagraph(0, 1, 1, 0) catch |err| {
                try std.testing.expect(current.sections[0].structure_values == null);
                try std.testing.expectEqual(@as(usize, 1), current.sections[0].last_paragraph);
                try std.testing.expectEqualStrings("AB", current.sections[0].sites.items[0].text);
                try std.testing.expectEqualSlices(u8, bytes, current.source);
                return err;
            };
            try std.testing.expectEqual(@as(?u32, 2), current.sections[0].structure_values.?.paragraphs[1].generated_id);
        }
    }.run, .{input});
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expectEqual(@as(?u32, 2), session.sections[0].structure_values.?.paragraphs[1].generated_id);
    const output = try session.save();
    defer a.free(output);
    var archive = try @import("../zip/archive.zig").open(a, output, .{});
    defer archive.deinit();
    const saved_master = try archive.decode(archive.entries[5], 10000);
    defer a.free(saved_master);
    try std.testing.expectEqualStrings(master, saved_master);
    var reopened = try @import("editor_session.zig").open(a, output, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 2), reopened.sections[0].last_paragraph);
    try std.testing.expectEqualStrings("A", reopened.sections[0].sites.items[0].text);
    try std.testing.expectEqualStrings("B", reopened.sections[0].sites.items[1].text);
}
