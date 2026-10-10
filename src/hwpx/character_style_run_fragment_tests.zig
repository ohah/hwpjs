const std = @import("std");
test "HWPX character style run fragment materializes missing text without duplicating metadata" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<p:run charPrIDRef='7' opaque='keep'/>", "<p:run charPrIDRef='7' opaque='keep'><!--once--><?keep value?></p:run>" }) |raw| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", raw, "</p:p></s:sec>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "A😀<&", 1000);
        const Span = @import("character_style_paint.zig").Span;
        const spans = [_]Span{
            .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 },
            .{ .start_unit = 1, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 },
            .{ .start_unit = 3, .end_unit = 5, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 7 },
        };
        var invalid = spans[0];
        invalid.site_index = sites.items.len;
        try std.testing.expectError(error.InvalidTextSites, @import("character_style_missing_run.zig").write(a, &tree, &sites, invalid, 1000, true));
        invalid = spans[0];
        invalid.run_element = tree.elements.len;
        try std.testing.expectError(error.InvalidTextSites, @import("character_style_missing_run.zig").write(a, &tree, &sites, invalid, 1000, true));
        sites.items[0].missing_text = false;
        try std.testing.expectError(error.SourceBindingMismatch, @import("character_style_missing_run.zig").write(a, &tree, &sites, spans[0], 1000, true));
        sites.items[0].missing_text = true;
        const output = try @import("character_style_run_xml.zig").write(a, &tree, &sites, &spans, 1000);
        defer a.free(output);
        try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>A</p:t>") != null);
        try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>😀</p:t>") != null);
        try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>&lt;&amp;</p:t>") != null);
        try std.testing.expectEqual(@as(usize, if (std.mem.indexOf(u8, raw, "<!--once-->") != null) 1 else 0), std.mem.count(u8, output, "<!--once-->"));
        try std.testing.expectEqual(@as(usize, if (std.mem.indexOf(u8, raw, "<?keep value?>") != null) 1 else 0), std.mem.count(u8, output, "<?keep value?>"));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, values: []const Span) !void {
                const result = try @import("character_style_run_xml.zig").write(allocator, t, s, values, 1000);
                defer allocator.free(result);
            }
        }.run, .{ &tree, &sites, @as([]const Span, &spans) });
    }
}

test "HWPX character style run fragment materializes an empty text tag from current owned text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t opaque='keep'/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var span: @import("character_style_paint.zig").Span = .{ .start_unit = 0, .end_unit = 0, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 };
    const empty = try @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, 1000);
    defer a.free(empty);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='9'><p:t opaque='keep'/></p:run>", empty);
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "A😀<&", 1000);
    span.start_unit = 1;
    span.end_unit = 3;
    const output = try @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='9'><p:t opaque='keep'>😀</p:t></p:run>", output);
    var complete = span;
    complete.start_unit = 0;
    complete.end_unit = 5;
    const escaped = try @import("character_style_run_fragment.zig").write(a, &tree, &sites, complete, 1000);
    defer a.free(escaped);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='9'><p:t opaque='keep'>A😀&lt;&amp;</p:t></p:run>", escaped);
    try std.testing.expectError(error.LimitExceeded, @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, output.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, value: @import("character_style_paint.zig").Span) !void {
            const result = try @import("character_style_run_fragment.zig").write(allocator, t, s, value, 1000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &sites, span });
    span.start_unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, 1000));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX character style run fragment preserves attributes and escapes current selected text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7' opaque='run'><p:t opaque='text'>A😀B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const span: @import("character_style_paint.zig").Span = .{ .start_unit = 1, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 9 };
    const result = try @import("character_style_run_fragment.zig").write(a, &tree, &sites, span, 1000);
    defer a.free(result);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='9' opaque='run'><p:t opaque='text'>😀</p:t></p:run>", result);
    var wrong = span;
    wrong.start_unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, @import("character_style_run_fragment.zig").write(a, &tree, &sites, wrong, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, value: @import("character_style_paint.zig").Span) !void {
            const output = try @import("character_style_run_fragment.zig").write(allocator, t, s, value, 1000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &sites, span });
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 1, "<&", 1000);
    var escaped_span = span;
    escaped_span.start_unit = 0;
    escaped_span.end_unit = 2;
    const escaped = try @import("character_style_run_fragment.zig").write(a, &tree, &sites, escaped_span, 1000);
    defer a.free(escaped);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='9' opaque='run'><p:t opaque='text'>&lt;&amp;</p:t></p:run>", escaped);
    try std.testing.expectEqualStrings(source, tree.source);
}
