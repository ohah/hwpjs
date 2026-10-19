const std = @import("std");
const flow = @import("paragraph_flow_break_save.zig");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const open = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const source = open ++ "<p:p id='1'/></s:sec>";
const serialized = open ++ "<p:p id='1'/><!--keep--><p:p id='2' opaque='&amp;'/></s:sec>";

fn paragraph() model.Paragraph {
    return .{ .template_element = 1, .source_ordinal = null, .generated_id = 2, .break_before = .page, .sites = .{ .items = &.{} } };
}

test "HWPX explicit flow save owns intent through clone and preserves unrelated serialized bytes" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var rows = [_]model.Paragraph{paragraph()};
    var current: model.Values = .{ .paragraphs = &rows };
    var cloned = try current.clone(a);
    defer cloned.deinit(a);
    rows[0].break_before = .column;
    try std.testing.expectEqual(@as(?@import("../model/paragraph_break.zig").Kind, .page), cloned.paragraphs[0].break_before);
    const page = try flow.write(a, &tree, &cloned, serialized, 2000);
    defer a.free(page);
    try std.testing.expectEqualStrings(open ++ "<p:p id='1'/><!--keep--><p:p id='2' opaque='&amp;' pageBreak=\"1\" columnBreak=\"0\"/></s:sec>", page);
    const column = try flow.write(a, &tree, &current, page, 2000);
    defer a.free(column);
    try std.testing.expectEqualStrings(open ++ "<p:p id='1'/><!--keep--><p:p id='2' opaque='&amp;' pageBreak=\"0\" columnBreak=\"1\"/></s:sec>", column);
    const bounded = try flow.write(a, &tree, &current, serialized, column.len);
    defer a.free(bounded);
    try std.testing.expectEqualSlices(u8, column, bounded);
    try std.testing.expectError(error.LimitExceeded, flow.write(a, &tree, &current, serialized, column.len - 1));
    try std.testing.expect(flow.hasIntent(&current));
    rows[0].break_before = null;
    try std.testing.expect(!flow.hasIntent(&current));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX explicit flow save refuses missing duplicate source-colliding and nested targets" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var rows = [_]model.Paragraph{paragraph()};
    const current: model.Values = .{ .paragraphs = &rows };
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &current, source, 2000));
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &current, open ++ "<p:p id='2'/><p:p id='2'/></s:sec>", 2000));
    try std.testing.expectError(error.UnsupportedParagraphBreakOwner, flow.write(a, &tree, &current, open ++ "<p:subList><p:p id='2'/></p:subList></s:sec>", 2000));
    rows[0].generated_id = 1;
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &current, serialized, 2000));
    rows[0] = paragraph();
    rows[0].source_ordinal = 1;
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &current, serialized, 2000));
    rows[0] = paragraph();
    rows[0].generated_id = null;
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &current, serialized, 2000));
    var duplicates = [_]model.Paragraph{ paragraph(), paragraph() };
    const duplicate_values: model.Values = .{ .paragraphs = &duplicates };
    try std.testing.expectError(error.SourceBindingMismatch, flow.write(a, &tree, &duplicate_values, serialized, 2000));
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX explicit flow save cleans every allocation failure" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var rows = [_]model.Paragraph{paragraph()};
    const current: model.Values = .{ .paragraphs = &rows };
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree, values: *const model.Values) !void {
            const output = try flow.write(allocator, original, values, serialized, 2000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(open ++ "<p:p id='1'/><!--keep--><p:p id='2' opaque='&amp;' pageBreak=\"1\" columnBreak=\"0\"/></s:sec>", output);
        }
    }.run, .{ &tree, &current });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "HWPX explicit flow actual ZIP serialization checkpoint and reopened query agree" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const first = session.sections[0].first_paragraph;
    try std.testing.expect(try session.splitParagraph(0, first, 0, 0));
    session.sections[0].structure_values.?.paragraphs[1].break_before = .page;
    const page = try session.save();
    defer a.free(page);
    const rows = try @import("paragraph_flow_snapshot.zig").read(a, &session, 0);
    defer @import("paragraph_flow_snapshot.zig").free(a, rows);
    try std.testing.expectEqual(@as(?bool, true), rows[1].page_break);
    try std.testing.expectEqual(@as(?bool, false), rows[1].column_break);
    var snapshot = try @import("editor_checkpoint.zig").capture(&session, 8_000_000);
    defer snapshot.deinit();
    session.sections[0].structure_values.?.paragraphs[1].break_before = .column;
    const column = try session.save();
    defer a.free(column);
    try std.testing.expect(!std.mem.eql(u8, page, column));
    try snapshot.exchange(&session);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, page, restored);
    try snapshot.exchange(&session);
    const exchanged = try session.save();
    defer a.free(exchanged);
    try std.testing.expectEqualSlices(u8, column, exchanged);
    for ([_][]const u8{ page, column }, 0..) |saved, index| {
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const actual = try @import("paragraph_flow_snapshot.zig").read(a, &reopened, 0);
        defer @import("paragraph_flow_snapshot.zig").free(a, actual);
        try std.testing.expectEqual(@as(?bool, index == 0), actual[1].page_break);
        try std.testing.expectEqual(@as(?bool, index == 1), actual[1].column_break);
        const unchanged = try reopened.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, saved, unchanged);
    }
    try std.testing.expect(try session.splitParagraph(0, first + 1, 0, 0));
    const split_rows = try @import("paragraph_flow_snapshot.zig").read(a, &session, 0);
    defer @import("paragraph_flow_snapshot.zig").free(a, split_rows);
    try std.testing.expectEqual(@as(?bool, false), split_rows[1].page_break);
    try std.testing.expectEqual(@as(?bool, true), split_rows[1].column_break);
    try std.testing.expect(session.sections[0].structure_values.?.paragraphs[2].break_before == null);
    try std.testing.expect(try session.mergeParagraph(0, first + 1));
    const merged = try session.save();
    defer a.free(merged);
    var before_merge = try @import("editor_session.zig").open(a, column, .{});
    defer before_merge.deinit();
    var after_merge = try @import("editor_session.zig").open(a, merged, .{});
    defer after_merge.deinit();
    // Repeated split intentionally materializes a previously virtual empty
    // typing site. Merge is not Undo: retain that site, allow no other XML drift.
    const expected_xml = before_merge.sections[0].tree.source;
    const empty_run = "<hp:run charPrIDRef=\"1\"></hp:run>";
    const location = std.mem.indexOf(u8, expected_xml, empty_run) orelse return error.MissingExpectedEmptyRun;
    const expected_merged = try std.mem.concat(a, u8, &.{ expected_xml[0..location], "<hp:run charPrIDRef=\"1\"><hp:t></hp:t></hp:run>", expected_xml[location + empty_run.len ..] });
    defer a.free(expected_merged);
    try std.testing.expectEqualSlices(u8, expected_merged, after_merge.sections[0].tree.source);
    const merged_flow = try @import("paragraph_flow_snapshot.zig").read(a, &after_merge, 0);
    defer @import("paragraph_flow_snapshot.zig").free(a, merged_flow);
    try std.testing.expectEqual(@as(?bool, false), merged_flow[1].page_break);
    try std.testing.expectEqual(@as(?bool, true), merged_flow[1].column_break);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
