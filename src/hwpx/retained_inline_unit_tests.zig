const Tree = @import("xml_part_tree.zig").Tree;
const supported = @import("retained_inline_unit.zig").supported;

test "HWPX retained space elements stay distinct from editable literal nonbreaking spaces" {
    const std = @import("std");
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A\xc2\xa0B<p:nbSpace/>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    _ = try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &tree, &sites, locations, 1, 1, 1, "", 10000, true);
    try std.testing.expectError(error.ProtectedInlineControl, @import("plain_paragraph_edit.zig").spliceWithTabs(a, &tree, &sites, locations, 1, 2, 1, "", 10000, true));
    const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "<p:t>AB<p:nbSpace/>C</p:t>") != null);
}

test "HWPX retained inline units reject visible payload children and foreign names" {
    const std = @import("std");
    const a = std.testing.allocator;
    inline for (.{ "<p:nbSpace>hidden</p:nbSpace>", "<p:fwSpace><p:t>hidden</p:t></p:fwSpace>", "<x:nbSpace xmlns:x='urn:other'/>", "<p:tab><!--hidden--></p:tab>", "<p:hypen>hidden</p:hypen>", "<p:hypen><p:t/></p:hypen>", "<x:hypen xmlns:x='urn:other'/>", "<p:hyphen/>" }) |body| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>" ++ body ++ "</p:t></p:run></p:p></s:sec>";
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |_, index| try std.testing.expect(!supported(&tree, index));
    }
}

test "HWPX retained inline space formatting preserves raw element and rejects forged tab kind" {
    const std = @import("std");
    const a = std.testing.allocator;
    inline for (.{ "<p:nbSpace extra='keep'/>", "<p:fwSpace extra='keep'/>", "<p:hypen extra='keep'/>" }) |element| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A" ++ element ++ "B</p:t></p:run></p:p></s:sec>";
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &sites, locations, 1);
        defer a.free(positions);
        var forged = positions[1];
        forged.kind = .tab;
        try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_text_positions.zig").validateInlineUnit(&tree, forged));
        const spans = try @import("character_style_tab_projection.zig").build(a, &tree, &sites, positions, 100);
        defer a.free(spans);
        const painted = try @import("character_style_tab_paint.zig").prepare(a, &sites, spans, 1, 2, 9, &.{ 7, 9 }, 100);
        defer a.free(painted);
        const run = tree.elements[sites.items[0].element_index].parent.?;
        const output = try @import("character_style_tab_run.zig").write(a, &tree, &sites, run, spans, painted, 10000);
        defer a.free(output);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, element));
        try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef='9'") != null);
    }
}

test "HWPX retained inline spaces preserve element spelling and protected Unicode positions under OOM" {
    const std = @import("std");
    const a = std.testing.allocator;
    inline for (.{ "<p:nbSpace/>", "<p:fwSpace/>", "<p:hypen/>" }, .{ "\xc2\xa0", "\xe2\x80\x87", "\xc2\xad" }) |element, spelling| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A" ++ element ++ "B😀</p:t></p:run></p:p></s:sec>";
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
                var sites = try @import("text_sites.zig").collect(allocator, parsed, .{ .materialize_tab_boundaries = true });
                defer sites.deinit(allocator);
                const locations = try @import("text_site_locations.zig").build(allocator, parsed, &sites, .{});
                defer allocator.free(locations);
                try std.testing.expectError(error.ProtectedInlineControl, @import("plain_paragraph_edit.zig").spliceWithTabs(std.testing.allocator, parsed, &sites, locations, 1, 1, 1, "", 10000, true));
                _ = @import("plain_paragraph_edit.zig").spliceWithTabs(allocator, parsed, &sites, locations, 1, 2, 1, "뒤", 10000, true) catch |err| {
                    try std.testing.expectEqualStrings("A", sites.items[0].text);
                    try std.testing.expectEqualStrings("B😀", sites.items[1].text);
                    return err;
                };
                const display = try @import("anchor_paragraph_edit.zig").text(allocator, parsed, &sites, locations, 1, 10000);
                defer allocator.free(display);
                try std.testing.expectEqualStrings("A" ++ spelling ++ "뒤😀", display);
                const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{ .materialize_tab_boundaries = true }, 10000);
                defer allocator.free(saved);
                try std.testing.expect(std.mem.indexOf(u8, saved, "A" ++ element ++ "뒤😀") != null);
            }
        }.run, .{&tree});
    }
}
