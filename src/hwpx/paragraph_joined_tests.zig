const std = @import("std");
const model = @import("paragraph_joined_values.zig");

test "HWPX joined model repeats merge and edits across heterogeneous source owners atomically" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run charPrIDRef='9'><p:t>B</p:t></p:run></p:p><p:p id='3'><p:run charPrIDRef='11'><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    var left = try model.Joined.fromParagraph(a, &values.paragraphs[0]);
    defer left.deinit(a);
    var right = try model.Joined.fromParagraph(a, &values.paragraphs[1]);
    defer right.deinit(a);
    var tail = try model.Joined.fromParagraph(a, &values.paragraphs[2]);
    defer tail.deinit(a);
    var first = try @import("paragraph_joined_merge.zig").prepare(a, &tree, &left, &right, 10000);
    defer first.deinit(a);
    var merged = try @import("paragraph_joined_merge.zig").prepare(a, &tree, &first, &tail, 10000);
    defer merged.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), merged.pieces.len);
    const size = try merged.byteSize(10000);
    try std.testing.expectEqual(size, try merged.byteSize(size));
    try std.testing.expectError(error.LimitExceeded, merged.byteSize(size - 1));
    try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_joined_splice.zig").splice(a, &tree, &merged, 2, 0, "x", 10000));
    try std.testing.expectError(error.InvalidXmlCharacter, @import("paragraph_joined_splice.zig").splice(a, &tree, &merged, 0, 0, &.{0}, 10000));
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_joined_splice.zig").splice(a, &tree, &merged, 0, 0, "x", 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, l: *const model.Joined, r: *const model.Joined) !void {
            var output = try @import("paragraph_joined_merge.zig").prepare(allocator, original, l, r, 10000);
            defer output.deinit(allocator);
        }
    }.run, .{ &tree, &first, &tail });
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, current: *const model.Joined) !void {
            var copy = try current.clone(allocator);
            defer copy.deinit(allocator);
            _ = @import("paragraph_joined_splice.zig").splice(allocator, original, &copy, 1, 3, "한<&", 10000) catch |err| {
                for (copy.sites.items, current.sites.items) |actual, expected| try std.testing.expectEqualStrings(expected.text, actual.text);
                return err;
            };
        }
    }.run, .{ &tree, &merged });
    try std.testing.expect(try @import("paragraph_joined_splice.zig").splice(a, &tree, &merged, 1, 3, "한<&", 10000));
    try std.testing.expectEqualStrings("A한<&", merged.sites.items[0].text);
    try std.testing.expectEqualStrings("", merged.sites.items[1].text);
    try std.testing.expectEqualStrings("C", merged.sites.items[2].text);
    try verifyOutput(a, &tree, &merged, "A한<&C", &.{ "7", "9", "11" });
    try std.testing.expectEqualStrings("A😀", left.sites.items[0].text);
    try std.testing.expectEqualStrings(source, tree.source);
    merged.pieces[1].first_site = 0;
    try std.testing.expectError(error.SourceBindingMismatch, merged.validate());
    merged.pieces[1].first_site = 1;
}

test "HWPX joined model preserves current piece order when split provenance repeats" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:t>A</p:t></p:run><p:run charPrIDRef='9'><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 1, 1, 2, 10000);
    defer split.deinit(a);
    const l = try a.dupe(u8, "L");
    a.free(split.paragraphs[0].sites.items[1].text);
    split.paragraphs[0].sites.items[1].text = l;
    const r = try a.dupe(u8, "R");
    a.free(split.paragraphs[1].sites.items[0].text);
    split.paragraphs[1].sites.items[0].text = r;
    var left = try model.Joined.fromParagraph(a, &split.paragraphs[0]);
    defer left.deinit(a);
    var right = try model.Joined.fromParagraph(a, &split.paragraphs[1]);
    defer right.deinit(a);
    var merged = try @import("paragraph_joined_merge.zig").prepare(a, &tree, &left, &right, 10000);
    defer merged.deinit(a);
    const positions = try @import("paragraph_joined_positions.zig").build(a, &tree, &merged);
    defer a.free(positions);
    try std.testing.expectEqual(@as(usize, 4), positions.len);
    for (positions, [_][]const u8{ "A", "L", "R", "B" }, 0..) |position, expected, index| {
        try std.testing.expectEqualStrings(expected, merged.sites.items[position.index].text);
        try std.testing.expectEqual(index, position.start_unit);
    }
    try verifyOutput(a, &tree, &merged, "ALRB", &.{ "7", "9", "7", "9" });
    var resplit = try @import("paragraph_joined_split.zig").prepare(a, &tree, &merged, 2, 2, 10000);
    defer resplit.deinit(a);
    for (resplit.left.sites.items, [_][]const u8{ "A", "L", "", "" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    for (resplit.right.sites.items, [_][]const u8{ "", "", "R", "B" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    try std.testing.expectEqualDeep(merged.pieces, resplit.left.pieces);
    try std.testing.expectEqualDeep(merged.pieces, resplit.right.pieces);
    try std.testing.expect(try @import("paragraph_joined_splice.zig").splice(a, &tree, &merged, 1, 2, "😀", 10000));
    try std.testing.expectEqualStrings("A😀", merged.sites.items[0].text);
    try std.testing.expectEqualStrings("", merged.sites.items[1].text);
    try std.testing.expectEqualStrings("", merged.sites.items[2].text);
    try std.testing.expectEqualStrings("B", merged.sites.items[3].text);
    try verifyOutput(a, &tree, &merged, "A😀B", &.{ "7", "9", "7", "9" });
}

fn verifyOutput(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const model.Joined, expected: []const u8, styles: []const []const u8) !void {
    const output = try @import("paragraph_joined_xml.zig").write(a, tree, current, .{}, 10000);
    defer a.free(output);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", output, "</s:sec>" });
    defer a.free(wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer sites.deinit(a);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    for (sites.items) |site| try text.appendSlice(a, site.text);
    try std.testing.expectEqualStrings(expected, text.items);
    var index: usize = 0;
    for (reopened.elements, 0..) |element, element_index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "run")) continue;
        try std.testing.expect(index < styles.len);
        const value = (try reopened.attributeValue(a, element_index, "", "charPrIDRef")).?;
        try std.testing.expect(value.text.equals(styles[index], false));
        index += 1;
    }
    try std.testing.expectEqual(styles.len, index);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, joined: *const model.Joined) !void {
            const xml = try @import("paragraph_joined_xml.zig").write(allocator, original, joined, .{}, 10000);
            defer allocator.free(xml);
        }
    }.run, .{ tree, current });
}
