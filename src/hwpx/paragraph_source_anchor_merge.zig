//! 직접 소유자의 두 원본 호스트를 병합하고 중첩 본문 행은 그대로 보존합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, left_index: usize, right_index: usize, limit: usize) !model.Values {
    if (left_index >= current.paragraphs.len or right_index >= current.paragraphs.len or right_index <= left_index) return error.InvalidParagraphIndex;
    if (try @import("paragraph_current_neighbor.zig").next(tree, current, left_index) != right_index) return error.InvalidParagraphAdjacency;
    const left = &current.paragraphs[left_index];
    const right = &current.paragraphs[right_index];
    var first = try fullSourceView(a, tree, left);
    defer first.deinit(a);
    var second = try fullSourceView(a, tree, right);
    defer second.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepareWithAnchors(a, tree, &first, &second, limit);
    var transferred = false;
    defer if (!transferred) joined.deinit(a);
    const segments = try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &joined);
    defer a.free(segments);
    const owned = try @import("paragraph_protected_positions.zig").side(a, segments, 0, 0, true);
    defer if (!transferred) a.free(owned);
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |paragraph, index| {
        if (index == right_index) continue;
        if (index == left_index) {
            rows[initialized] = .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .generated_id = left.generated_id, .paragraph_shape_id = left.paragraph_shape_id, .sites = joined.sites, .pieces = joined.pieces, .character_styles = joined.character_styles, .protected_positions = owned };
            transferred = true;
        } else rows[initialized] = try paragraph.clone(a);
        initialized += 1;
    }
    const output: model.Values = .{ .paragraphs = rows };
    _ = try output.byteSize(limit);
    return output;
}

// 전체 원본 객체를 가진 병합 문단만 추가 원본 병합에 사용할 수 있습니다.
// 분할 그룹은 이 진입점에서 원본 객체를 다시 복원하지 않습니다.
fn fullSourceView(a: std.mem.Allocator, tree: *const Tree, paragraph: *const model.Paragraph) !Joined {
    if (paragraph.column_boundaries != null) return error.UnsupportedColumnBoundaryEdit;
    if (paragraph.protected_positions) |owned| {
        const view = paragraph.joined() orelse return error.UnsupportedAnchoredStructure;
        if (paragraph.generated_id != null) return error.UnsupportedAnchoredStructure;
        for (view.pieces) |piece| if (!piece.owns_source or piece.source_ordinal == null or piece.generated_id != null) return error.UnsupportedAnchoredStructure;
        const full = try @import("paragraph_joined_positions.zig").buildWithAnchors(a, tree, &view);
        defer a.free(full);
        const current = try @import("paragraph_joined_positions.zig").buildOwnedAnchors(a, tree, &view, owned);
        defer a.free(current);
        if (full.len != current.len) return error.UnsupportedAnchoredStructure;
        for (full, current) |one, two| if (!std.meta.eql(one, two)) return error.UnsupportedAnchoredStructure;
        return view.clone(a);
    }
    return Joined.fromParagraph(a, paragraph);
}

test "HWPX source anchor merge native transaction allocation safety" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:t>A</p:t><p:rect><p:subList><p:p id='2'><p:run><p:t>inside</p:t></p:run></p:p></p:subList></p:rect></p:run></p:p><p:p id='3'><p:run><p:t>B</p:t><p:pic/></p:run></p:p><p:p id='4'><p:run><p:t>C</p:t><p:pic/></p:run></p:p>");
    defer a.free(input);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, source, .{});
            defer session.deinit();
            const original_last = session.sections[0].last_paragraph;
            _ = session.mergeParagraphPair(0, 1, 3) catch |err| {
                try std.testing.expect(session.sections[0].structure_values == null);
                try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqualSlices(u8, source, session.source);
                return err;
            };
            try std.testing.expect(try session.canEdit(0, 1));
            const text = try session.anchorText(0, 1);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("A\xef\xbf\xbcB\xef\xbf\xbc", text);
            _ = try session.mergeParagraphPair(0, 1, 3);
            const extended = try session.anchorText(0, 1);
            defer allocator.free(extended);
            try std.testing.expectEqualStrings("A\xef\xbf\xbcB\xef\xbf\xbcC\xef\xbf\xbc", extended);
            const saved = try session.save();
            defer allocator.free(saved);
            var reopened = try @import("editor_session.zig").open(allocator, saved, .{});
            defer reopened.deinit();
            try std.testing.expectEqual(original_last - 2, reopened.sections[0].last_paragraph);
        }
    };
    try Probe.run(a, input);
    var audit_allocator: std.heap.DebugAllocator(.{ .stack_trace_frames = 0, .page_size = 4096 }) = .init;
    defer std.debug.assert(audit_allocator.deinit() == .ok);
    var measured = std.testing.FailingAllocator.init(audit_allocator.allocator(), .{});
    try Probe.run(measured.allocator(), input);
    try std.testing.expectEqual(measured.allocated_bytes, measured.freed_bytes);
    std.debug.print("source anchor transaction allocations={d}, bytes={d}, freed={d}\n", .{ measured.alloc_index, measured.allocated_bytes, measured.freed_bytes });
    try std.testing.checkAllAllocationFailures(audit_allocator.allocator(), Probe.run, .{input});
}

test "HWPX adjacent source pictures merge through public paragraph transaction" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:t>A</p:t><p:pic/></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t><p:pic/></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const text = try session.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("A\xef\xbf\xbcB\xef\xbf\xbc", text);
    const merged = try session.save();
    defer a.free(merged);
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 2, 0));
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const rejoined = try session.save();
    defer a.free(rejoined);
    try std.testing.expectEqualSlices(u8, merged, rejoined);
}
