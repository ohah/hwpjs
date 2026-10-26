//! Current table placement records derived from selected cell ownership.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Placement = struct {
    table_node: usize,
    paragraph: usize,
    parent_table_node: ?usize,
    parent_list_node: ?usize,
    anchor_unit: ?usize = null,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Placement {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const bindings = try @import("table_display_bindings.zig").fromParagraphs(a, section, current.paragraphs);
    defer a.free(bindings);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var output: std.ArrayList(Placement) = .empty;
    defer output.deinit(a);
    for (bindings) |binding| {
        const entry = try seen.getOrPut(a, binding.owner.table_node);
        if (entry.found_existing) continue;
        const source = try @import("table_display_placement.zig").resolve(a, &section.tree, binding.owner.table_node);
        const direct_anchor = @import("run_anchor.zig").kind(&section.tree, binding.owner.table_node) == .table;
        const paragraph = if (direct_anchor)
            try @import("table_display_host.zig").currentOrdinalWithAnchor(current.paragraphs, section.first_paragraph, source.paragraph_template, binding.owner.table_node)
        else
            try @import("table_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, source.paragraph_template);
        try output.append(a, .{
            .table_node = binding.owner.table_node,
            .paragraph = paragraph,
            .parent_table_node = if (source.parent_cell) |parent| parent.table_node else null,
            .parent_list_node = if (source.parent_cell) |parent| parent.list_node else null,
            .anchor_unit = if (direct_anchor)
                try @import("table_display_host.zig").anchorUnit(a, &section.tree, &current.paragraphs[paragraph - section.first_paragraph], binding.owner.table_node)
            else
                null,
        });
    }
    return output.toOwnedSlice(a);
}

test "HWPX current table placements list actual nested ownership with full allocation failures" {
    const a = std.testing.allocator;
    // 실패 지점 전수 검사는 유지하되 정상 할당 스택의 누적 비용을 분리한다.
    var failure_backing: std.heap.DebugAllocator(.{ .stack_trace_frames = 0 }) = .init;
    defer std.testing.expect(failure_backing.deinit() == .ok) catch @panic("placement failure backing leaked");
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const expected = try read(a, &session, 0);
    defer a.free(expected);
    var nested: usize = 0;
    for (expected) |placement| {
        try std.testing.expect(placement.paragraph >= session.sections[0].first_paragraph);
        if (placement.parent_table_node) |parent| {
            try std.testing.expect(parent != placement.table_node);
            try std.testing.expect(placement.parent_list_node != null);
            nested += 1;
        } else try std.testing.expect(placement.parent_list_node == null);
    }
    try std.testing.expect(nested > 0);
    try std.testing.checkAllAllocationFailures(failure_backing.allocator(), struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, reference: []const Placement) !void {
            const actual = try read(allocator, state, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(reference, actual);
        }
    }.run, .{ &session, expected });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
}

test "HWPX placement allocation measurement on actual nested fixture" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var counter = std.testing.FailingAllocator.init(a, .{});
    const counted = counter.allocator();
    const rows = try read(counted, &session, 0);
    defer counted.free(rows);
    std.debug.print("placement query: {d} allocations, {d} tables\n", .{ counter.alloc_index, rows.len });
    try std.testing.expect(rows.len > 0);
    var view_counter = std.testing.FailingAllocator.init(a, .{});
    var view = try @import("display_current_paragraphs.zig").read(view_counter.allocator(), &session.sections[0], session.options);
    defer view.deinit(view_counter.allocator());
    var binding_counter = std.testing.FailingAllocator.init(a, .{});
    const bindings = try @import("table_display_bindings.zig").fromParagraphs(binding_counter.allocator(), &session.sections[0], view.paragraphs);
    defer binding_counter.allocator().free(bindings);
    std.debug.print("placement phases: view={d}, bindings={d}, paragraphs={d}\n", .{ view_counter.alloc_index, binding_counter.alloc_index, view.paragraphs.len });
    try std.testing.expect(bindings.len > 0);
}

test "HWPX placement small fixture checks every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const expected = try read(a, &session, 0);
    defer a.free(expected);
    try std.testing.expect(expected.len > 0);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, reference: []const Placement) !void {
            const actual = try read(allocator, state, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(reference, actual);
        }
    }.run, .{ &session, expected });
}
