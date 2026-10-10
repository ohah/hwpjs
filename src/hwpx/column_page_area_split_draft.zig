//! 본문과 두 선언 배열을 같은 범위로 절단하는 소유 후보입니다.
//! 문단 식별자·중첩 순서·그룹 저장은 구조 편집 계층이 담당합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Text = @import("paragraph_joined_split.zig").Draft;
const Metadata = @import("column_page_area_split_plan.zig").Plan;

pub const Draft = struct {
    text: Text,
    metadata: Metadata,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.text.deinit(a);
        self.metadata.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, metadata_limit: usize, byte_limit: usize) !Draft {
    const metadata = try @import("column_page_area_split_plan.zig").prepare(a, tree, paragraph, at, end, metadata_limit);
    return assemble(a, tree, paragraph, at, end, byte_limit, metadata);
}

pub fn prepareMember(a: std.mem.Allocator, tree: *const Tree, group: []const Paragraph, index: usize, at: u32, end: u32, metadata_limit: usize, byte_limit: usize) !Draft {
    const metadata = try @import("column_page_area_split_plan.zig").prepareMember(a, tree, group, index, at, end, metadata_limit);
    return assemble(a, tree, &group[index], at, end, byte_limit, metadata);
}

fn assemble(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, at: u32, end: u32, byte_limit: usize, owned_metadata: Metadata) !Draft {
    var metadata = owned_metadata;
    errdefer metadata.deinit(a);
    const column_count = std.math.add(usize, metadata.columns.left.len, metadata.columns.right.len) catch return error.LimitExceeded;
    const area_count = std.math.add(usize, metadata.areas.left.len, metadata.areas.right.len) catch return error.LimitExceeded;
    const column_bytes = std.math.mul(usize, column_count, @sizeOf(@import("column_boundary_position.zig").Position)) catch return error.LimitExceeded;
    const area_bytes = std.math.mul(usize, area_count, @sizeOf(@import("page_area_position.zig").Position)) catch return error.LimitExceeded;
    const metadata_bytes = std.math.add(usize, column_bytes, area_bytes) catch return error.LimitExceeded;
    if (metadata_bytes > byte_limit) return error.LimitExceeded;
    const joined = paragraph.joined().?;
    var text = try @import("paragraph_joined_split.zig").prepare(a, tree, &joined, at, end, byte_limit - metadata_bytes);
    errdefer text.deinit(a);
    return .{ .text = text, .metadata = metadata };
}

test "mixed declaration text draft keeps source bindings and releases failed candidates" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    const section = &session.sections[0];
    const source = &section.structure_values.?.paragraphs[0];
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
            var draft = try prepare(allocator, tree, paragraph, 1, 3, 3, 4000000);
            defer draft.deinit(allocator);
            const left = try @import("paragraph_joined_positions.zig").build(allocator, tree, &draft.text.left);
            defer allocator.free(left);
            const right = try @import("paragraph_joined_positions.zig").build(allocator, tree, &draft.text.right);
            defer allocator.free(right);
            try std.testing.expectEqual(@as(usize, 1), left[left.len - 1].end_unit);
            try std.testing.expectEqual(@as(usize, 2), right[right.len - 1].end_unit);
            try std.testing.expectEqualDeep(paragraph.pieces.?, draft.text.left.pieces);
            try std.testing.expectEqualDeep(paragraph.pieces.?, draft.text.right.pieces);
            try std.testing.expectEqual(@as(usize, 1), draft.metadata.columns.left.len);
            try std.testing.expectEqual(@as(usize, 2), draft.metadata.areas.right.len);
            for (draft.metadata.areas.right) |area| try std.testing.expectEqual(@as(u32, 2), area.unit);
        }
    };
    try Probe.run(a, &section.tree, source);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, source });
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, source, 1, 3, 3, 1));
    var reference = try prepare(a, &section.tree, source, 1, 3, 3, 4000000);
    defer reference.deinit(a);
    const exact_bytes = try reference.text.left.byteSize(4000000) + try reference.text.right.byteSize(4000000) + @sizeOf(@import("column_boundary_position.zig").Position) + 2 * @sizeOf(@import("page_area_position.zig").Position);
    var exact = try prepare(a, &section.tree, source, 1, 3, 3, exact_bytes);
    defer exact.deinit(a);
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, source, 1, 3, 3, exact_bytes - 1));
    for (source.page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 5), area.unit);
}
