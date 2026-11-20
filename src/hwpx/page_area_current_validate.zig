//! 현재 원본 문단의 쪽 영역 귀속을 저장 전 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    return validateMode(a, tree, paragraph, false, false);
}

pub fn validateForRelocation(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    return validateMode(a, tree, paragraph, true, false);
}

/// 그룹 멤버의 부분 귀속만 검사합니다. 전체 선언 보존은 그룹 검증기가 소유합니다.
pub fn validatePartitionMember(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !void {
    return validateMode(a, tree, paragraph, true, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, relocation: bool, partition: bool) !void {
    if (paragraph.page_area_positions == null) return;
    if (paragraph.pieces != null and paragraph.column_boundaries != null and relocation) return @import("column_page_area_joined_validate.zig").validate(a, tree, paragraph);
    if (paragraph.pieces != null and relocation) {
        if (partition) return @import("page_area_joined_validate.zig").validateMember(a, tree, paragraph);
        return @import("page_area_joined_validate.zig").validate(a, tree, paragraph);
    }
    if ((!partition and paragraph.generated_id != null) or (paragraph.generated_id == null and paragraph.source_ordinal == null) or (paragraph.generated_id != null and paragraph.source_ordinal != null) or paragraph.pieces != null or paragraph.protected_positions != null or paragraph.field_positions != null or paragraph.character_styles != null or paragraph.column_boundaries != null) return error.UnsupportedPageAreaOwnership;
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(segments);
    const actual = try @import("page_area_source_positions.zig").collect(a, tree, paragraph.template_element, segments, tree.elements.len);
    defer a.free(actual);
    try validatePositions(a, paragraph, segments, actual, relocation, partition);
}

/// 소유 모델별 출처 검사 뒤 공유하는 선언 identity와 현재 좌표 검증입니다.
pub fn validatePositions(a: std.mem.Allocator, paragraph: *const Paragraph, segments: []const @import("paragraph_text_positions.zig").Segment, actual: []const @import("page_area_position.zig").Position, relocation: bool, partition: bool) !void {
    const owned = paragraph.page_area_positions orelse return error.MissingPageAreaPositions;
    if (!partition and actual.len != owned.len) return error.SourceBindingMismatch;
    var by_element: std.AutoHashMapUnmanaged(usize, @import("page_area_position.zig").Position) = .empty;
    defer by_element.deinit(a);
    if (partition) for (actual) |item| {
        const slot = try by_element.getOrPut(a, item.source_element);
        if (slot.found_existing) return error.SourceBindingMismatch;
        slot.value_ptr.* = item;
    };
    var boundaries = try @import("paragraph_boundary_cursor.zig").Cursor.init(&paragraph.sites, segments);
    for (owned, 0..) |current, index| {
        const source = if (!partition) actual[index] else source: {
            if (index != 0 and current.source_element <= owned[index - 1].source_element) return error.SourceBindingMismatch;
            break :source by_element.get(current.source_element) orelse return error.SourceBindingMismatch;
        };
        if (source.source_element != current.source_element or source.source_control != current.source_control) return error.SourceBindingMismatch;
        if (index != 0 and current.unit < owned[index - 1].unit) return error.InvalidPageAreaOrder;
        try boundaries.validate(current.unit);
        if (!relocation and source.unit != current.unit) return error.UnsupportedPageAreaRelocation;
        if (current.affinity != @import("page_area_position.zig").canonicalAffinity(current.unit)) return error.UnsupportedPageAreaAffinity;
    }
}

test "document text HX page metadata validation retains identity scalar and partition guards" {
    const a = std.testing.allocator;
    const items = block: {
        const rows = try a.alloc(@import("text_sites.zig").Site, 1);
        errdefer a.free(rows);
        rows[0] = .{ .element_index = 0, .start = 0, .end = 1, .text = try a.dupe(u8, "한😀abc") };
        break :block rows;
    };
    var sites: @import("text_sites.zig").Sites = .{ .items = items };
    defer sites.deinit(a);
    const Position = @import("page_area_position.zig").Position;
    var owned = [_]Position{
        .{ .source_element = 10, .source_control = 9, .unit = 1, .affinity = .right },
        .{ .source_element = 0xfffffffe, .source_control = 21, .unit = 3, .affinity = .right },
    };
    const actual = owned;
    const paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites, .page_area_positions = &owned };
    const segments = [_]@import("paragraph_text_positions.zig").Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 6 },
    };
    try validatePositions(a, &paragraph, &segments, &actual, true, true);
    owned[0].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, validatePositions(a, &paragraph, &segments, &actual, true, true));
    try std.testing.expectEqual(@as(u32, 2), owned[0].unit);
    owned = actual;
    owned[1].source_control = 99;
    try std.testing.expectError(error.SourceBindingMismatch, validatePositions(a, &paragraph, &segments, &actual, true, true));
    owned = actual;
    owned[1].unit = 0xfffffffe;
    try std.testing.expectError(error.InvalidTextPosition, validatePositions(a, &paragraph, &segments, &actual, true, true));
    owned = actual;
    owned[0].affinity = .left;
    try std.testing.expectError(error.UnsupportedPageAreaAffinity, validatePositions(a, &paragraph, &segments, &actual, true, true));
    owned = actual;
    const duplicate = [_]Position{ actual[0], actual[0] };
    try std.testing.expectError(error.SourceBindingMismatch, validatePositions(a, &paragraph, &segments, &duplicate, true, true));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, current: *const Paragraph, positions: []const @import("paragraph_text_positions.zig").Segment, original: []const Position) !void {
            try validatePositions(allocator, current, positions, original, true, true);
        }
    }.run, .{ &paragraph, @as([]const @import("paragraph_text_positions.zig").Segment, &segments), @as([]const Position, &actual) });
}

test "page area owned source save validates identities and preserves nested current text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer values.deinit(a);
    const owner = &values.paragraphs[1];
    try @import("page_area_materialize.zig").install(a, &section.tree, owner, 2);
    try validate(a, &section.tree, owner);
    const saved = try @import("paragraph_structure_save.zig").write(a, &section.tree, &values, options, &.{}, 4000000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "머리😀") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<hp:header "));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<hp:footer "));
    const original = owner.page_area_positions.?[1];
    owner.page_area_positions.?[1] = owner.page_area_positions.?[0];
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, owner));
    owner.page_area_positions.?[1] = original;
    owner.page_area_positions.?[0].unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, validate(a, &section.tree, owner));
    owner.page_area_positions.?[0].unit = 0;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, current: *const Paragraph) !void {
            try validate(allocator, tree, current);
        }
    }.run, .{ &section.tree, owner });
    const spelling = try a.dupe(u8, "AB😀");
    a.free(owner.sites.items[0].text);
    owner.sites.items[0].text = spelling;
    owner.page_area_positions.?[0].unit = 1;
    try std.testing.expectError(error.UnsupportedPageAreaRelocation, validate(a, &section.tree, owner));
    owner.page_area_positions.?[0].unit = 3;
    try std.testing.expectError(error.SplitSurrogatePair, validate(a, &section.tree, owner));
    owner.page_area_positions.?[0].unit = 0;
    try validate(a, &section.tree, owner);
    try std.testing.expect(section.structure_values == null);
}
