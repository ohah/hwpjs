//! 원본 객체 병합 후보에 검증된 단 선언 소유권을 설치합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, left: usize, right: usize, limit: usize) !model.Values {
    var candidate = try @import("paragraph_source_anchor_merge.zig").prepare(a, tree, current, left, right, limit);
    errdefer candidate.deinit(a);
    try @import("column_boundary_joined_materialize.zig").installWithAnchors(a, tree, &candidate.paragraphs[left], tree.elements.len);
    candidate.paragraphs[left].column_structure_changed = true;
    _ = try candidate.byteSize(limit);
    return candidate;
}

test "source column anchor candidate handles first metadata and right fixture objects" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "aligns", "noori", "sample-5017-pics", "shapepict-scaled", "table-position" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        var report: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
        defer current.deinit(a);
        var candidate = try prepare(a, &section.tree, &current, 0, 1, 4000000);
        defer candidate.deinit(a);
        try std.testing.expectEqual(current.paragraphs.len - 1, candidate.paragraphs.len);
        try std.testing.expect(candidate.paragraphs[0].protected_positions != null);
        try std.testing.expect(candidate.paragraphs[0].column_boundaries != null);
        try std.testing.expect(session.sections[0].structure_values == null);
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
}

test "source column anchor candidate allocation failures retain original values" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/aligns.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
    defer current.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, values: *const model.Values) !void {
            defer {
                std.debug.assert(values.paragraphs[0].pieces == null);
                std.debug.assert(values.paragraphs[0].protected_positions == null);
                std.debug.assert(values.paragraphs[0].column_boundaries == null);
            }
            var candidate = try prepare(allocator, tree, values, 0, 1, 4000000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(values.paragraphs.len - 1, candidate.paragraphs.len);
            try std.testing.expect(candidate.paragraphs[0].protected_positions != null);
            try std.testing.expect(candidate.paragraphs[0].column_boundaries != null);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, &current });
    try std.testing.expect(current.paragraphs[0].pieces == null);
    try std.testing.expect(current.paragraphs[0].protected_positions == null);
    try std.testing.expect(current.paragraphs[0].column_boundaries == null);
    try std.testing.expect(section.structure_values == null);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
