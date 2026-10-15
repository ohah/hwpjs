const std = @import("std");

test "field host query prepares actual table ownership without granting object deletion" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(8_000_000));
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    const owner = found: {
        var ordinal: usize = 0;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(@import("hwpx/document_xml.zig").paragraph_uri, "p")) continue;
            ordinal += 1;
            if (ordinal == 17) break :found index;
        }
        return error.MissingParagraph;
    };
    var source = try @import("hwpx/source_field_analysis.zig").lease(&session);
    defer source.deinit(a);
    var overlapping: usize = 0;
    for (source.source.fields) |field| {
        if (field.section != 0 or field.content_start >= tree.elements[owner].end or field.content_end <= tree.elements[owner].start_tag.start) continue;
        const begin = source.source.report.markers[field.begin_marker].element_index;
        overlapping += 1;
        const prepared = try @import("hwpx/field_label_session.zig").prepare(&session, 0, 17, begin);
        defer prepared.deinit(a);
        try std.testing.expect(prepared.segments.len > 0);
        try std.testing.expect((try @import("hwpx/field_label_range_target.zig").select(&session, 0, 17, 0, 0)) != null);
        try std.testing.expectEqual(null, try @import("hwpx/field_label_range_target.zig").select(&session, 0, 17, 0, 1));
        const display = try @import("hwpx/field_label_display_text.zig").read(&session, 0, 17);
        defer a.free(display);
        try std.testing.expectEqualStrings("\xef\xbf\xbc", display);
    }
    try std.testing.expect(overlapping > 0);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "field queries retain ambiguity, empty labels, Unicode and allocation failure cleanup" {
    const a = std.testing.allocator;
    const input = try @import("hwpx/test_formula_fixture.zig").zipWithParagraphs(
        a,
        "<p:p><p:run><p:ctrl><p:fieldBegin id='101' type='HYPERLINK'/></p:ctrl><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='101'/></p:ctrl><p:ctrl><p:fieldBegin id='102' type='HYPERLINK'/></p:ctrl><p:t></p:t><p:ctrl><p:fieldEnd beginIDRef='102'/></p:ctrl></p:run></p:p>",
    );
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const select = @import("hwpx/field_label_range_target.zig").select;
    try std.testing.expectError(error.UnsupportedFieldLabelRange, select(&session, 0, 1, 3, 3));
    try std.testing.expectError(error.SplitSurrogatePair, select(&session, 0, 1, 2, 2));
    try std.testing.expectEqual(null, try select(&session, 0, 1, 4, 4));
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("hwpx/editor_session.zig").Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const target = (try @import("hwpx/field_label_range_target.zig").select(&proxy, 0, 1, 0, 3)).?;
            try std.testing.expectEqual(@as(u32, 3), target.end);
            const display = try @import("hwpx/field_label_display_text.zig").read(&proxy, 0, 1);
            defer allocator.free(display);
            try std.testing.expectEqualStrings("A😀", display);
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "field owned and uncached queries release every failed allocation without changing the session" {
    const a = std.testing.allocator;
    const input = try @import("hwpx/test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='101' type='HYPERLINK'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='101'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const before = try session.save();
    defer a.free(before);
    const row = &session.sections[0].structure_values.?.paragraphs[1];
    try std.testing.expect(row.field_positions != null);
    for ([_]bool{ false, true }) |uncached| {
        try @import("testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const @import("hwpx/editor_session.zig").Session, fresh: bool) !void {
                var proxy = source.*;
                proxy.allocator = allocator;
                if (fresh) proxy.source_fields = null;
                const selected = (try @import("hwpx/field_label_range_target.zig").select(&proxy, 0, 2, 0, 2)).?;
                try std.testing.expectEqual(@as(u32, 0), selected.start);
                try std.testing.expectEqual(@as(u32, 3), selected.end);
                const display = try @import("hwpx/field_label_display_text.zig").read(&proxy, 0, 2);
                defer allocator.free(display);
                try std.testing.expectEqualStrings("😀B", display);
            }
        }.run, .{ &session, uncached });
    }
    try std.testing.expectError(error.SplitSurrogatePair, @import("hwpx/field_label_range_target.zig").select(&session, 0, 2, 1, 1));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualStrings("😀B", row.sites.items[0].text);
}
