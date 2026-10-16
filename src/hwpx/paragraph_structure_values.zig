//! Owned current structural values. XML templates remain immutable provenance.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
pub const ProtectedPosition = struct {
    element_index: usize,
    unit: usize,
    kind: @FieldType(@import("anchor_split_plan.zig").Move, "kind"),
};
pub const Paragraph = struct {
    template_element: usize,
    source_ordinal: ?usize,
    generated_id: ?u32 = null,
    /// Explicit current override; null retains the immutable template reference.
    paragraph_shape_id: ?u32 = null,
    /// New-run fallback style. When materialized, character_styles owns current
    /// formatting; this ID remains provenance. Sites is the sole text owner.
    synthesized_run_character_id: ?u32 = null,
    sites: Sites,
    /// Authoritative current style partition when materialized; never text/XML.
    character_styles: ?[]@import("character_style_paint.zig").Span = null,
    /// When set, Sites remains the only text owner; pieces hold provenance only.
    pieces: ?[]@import("paragraph_joined_values.zig").Piece = null,
    /// null은 원본 귀속, 빈 배열은 현재 문단에 보호 개체가 없음을 나타냅니다.
    protected_positions: ?[]ProtectedPosition = null,
    /// null은 원본 귀속, 빈 배열은 이 문단이 필드 마커를 소유하지 않음을 뜻합니다.
    field_positions: ?[]@import("field_position.zig").Position = null,
    /// null retains original title ownership; an empty slice owns no titles.
    title_positions: ?[]@import("title_mark_position.zig").Position = null,
    /// null retains source ownership; an empty slice explicitly owns no boundary.
    /// Materialized lazily by column_boundary_session on eligible text edits.
    column_boundaries: ?[]@import("column_boundary_position.zig").Position = null,
    /// null은 원본 쪽 영역 귀속, 빈 배열은 현재 문단에 선언이 없음을 뜻합니다.
    page_area_positions: ?[]@import("page_area_position.zig").Position = null,
    /// Column topology changed; source line geometry must not be resurrected.
    column_structure_changed: bool = false,
    pub fn joined(self: *const Paragraph) ?@import("paragraph_joined_values.zig").Joined {
        return if (self.pieces) |pieces| .{ .pieces = pieces, .sites = self.sites, .character_styles = self.character_styles } else null;
    }
    pub fn deinit(self: *Paragraph, a: std.mem.Allocator) void {
        if (self.character_styles) |styles| a.free(styles);
        if (self.pieces) |pieces| a.free(pieces);
        if (self.protected_positions) |items| a.free(items);
        if (self.field_positions) |items| a.free(items);
        if (self.title_positions) |items| a.free(items);
        if (self.column_boundaries) |items| a.free(items);
        if (self.page_area_positions) |items| a.free(items);
        self.sites.deinit(a);
        self.* = undefined;
    }
    pub fn clone(self: *const Paragraph, a: std.mem.Allocator) !Paragraph {
        const styles = if (self.character_styles) |items| try a.dupe(@import("character_style_paint.zig").Span, items) else null;
        errdefer if (styles) |items| a.free(items);
        const pieces = if (self.pieces) |items| try a.dupe(@import("paragraph_joined_values.zig").Piece, items) else null;
        errdefer if (pieces) |items| a.free(items);
        const protected = if (self.protected_positions) |items| try a.dupe(ProtectedPosition, items) else null;
        errdefer if (protected) |items| a.free(items);
        const field_positions = if (self.field_positions) |items| try a.dupe(@import("field_position.zig").Position, items) else null;
        errdefer if (field_positions) |items| a.free(items);
        const titles = if (self.title_positions) |items| try a.dupe(@import("title_mark_position.zig").Position, items) else null;
        errdefer if (titles) |items| a.free(items);
        const columns = if (self.column_boundaries) |items| try a.dupe(@import("column_boundary_position.zig").Position, items) else null;
        errdefer if (columns) |items| a.free(items);
        const areas = if (self.page_area_positions) |items| try a.dupe(@import("page_area_position.zig").Position, items) else null;
        errdefer if (areas) |items| a.free(items);
        return .{ .template_element = self.template_element, .source_ordinal = self.source_ordinal, .generated_id = self.generated_id, .paragraph_shape_id = self.paragraph_shape_id, .synthesized_run_character_id = self.synthesized_run_character_id, .sites = try self.sites.clone(a), .pieces = pieces, .character_styles = styles, .protected_positions = protected, .field_positions = field_positions, .title_positions = titles, .column_boundaries = columns, .page_area_positions = areas, .column_structure_changed = self.column_structure_changed };
    }
};

pub const Values = struct {
    paragraphs: []Paragraph,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.paragraphs) |*paragraph| paragraph.deinit(a);
        a.free(self.paragraphs);
        self.* = undefined;
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        const paragraphs = try a.alloc(Paragraph, self.paragraphs.len);
        var initialized: usize = 0;
        errdefer {
            for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
            a.free(paragraphs);
        }
        for (self.paragraphs, paragraphs) |paragraph, *copy| {
            copy.* = try paragraph.clone(a);
            initialized += 1;
        }
        return .{ .paragraphs = paragraphs };
    }
    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var bytes = std.math.mul(usize, self.paragraphs.len, @sizeOf(Paragraph)) catch return error.LimitExceeded;
        if (bytes > limit) return error.LimitExceeded;
        for (self.paragraphs) |paragraph| {
            if (paragraph.title_positions) |items| {
                const amount = std.math.mul(usize, items.len, @sizeOf(@import("title_mark_position.zig").Position)) catch return error.LimitExceeded;
                if (amount > limit - bytes) return error.LimitExceeded;
                bytes += amount;
            }
            if (paragraph.page_area_positions) |items| {
                const amount = std.math.mul(usize, items.len, @sizeOf(@import("page_area_position.zig").Position)) catch return error.LimitExceeded;
                bytes = std.math.add(usize, bytes, amount) catch return error.LimitExceeded;
                if (bytes > limit) return error.LimitExceeded;
            }
            if (paragraph.field_positions) |items| {
                const amount = std.math.mul(usize, items.len, @sizeOf(@import("field_position.zig").Position)) catch return error.LimitExceeded;
                if (amount > limit - bytes) return error.LimitExceeded;
                bytes += amount;
            }
            if (paragraph.column_boundaries) |items| {
                const amount = std.math.mul(usize, items.len, @sizeOf(@import("column_boundary_position.zig").Position)) catch return error.LimitExceeded;
                if (amount > limit - bytes) return error.LimitExceeded;
                bytes += amount;
            }
            if (paragraph.protected_positions) |items| {
                const amount = std.math.mul(usize, items.len, @sizeOf(ProtectedPosition)) catch return error.LimitExceeded;
                if (amount > limit - bytes) return error.LimitExceeded;
                bytes += amount;
            }
            if (paragraph.character_styles) |styles| {
                const style_bytes = std.math.mul(usize, styles.len, @sizeOf(@import("character_style_paint.zig").Span)) catch return error.LimitExceeded;
                if (style_bytes > limit - bytes) return error.LimitExceeded;
                bytes += style_bytes;
            }
            if (paragraph.joined()) |view| {
                try view.validate();
                const piece_bytes = std.math.mul(usize, view.pieces.len, @sizeOf(@import("paragraph_joined_values.zig").Piece)) catch return error.LimitExceeded;
                if (piece_bytes > limit - bytes) return error.LimitExceeded;
                bytes += piece_bytes;
            }
            const rows = std.math.mul(usize, paragraph.sites.items.len, @sizeOf(@import("text_sites.zig").Site)) catch return error.LimitExceeded;
            if (rows > limit - bytes) return error.LimitExceeded;
            bytes += rows;
            for (paragraph.sites.items) |site| {
                if (site.text.len > limit - bytes) return error.LimitExceeded;
                bytes += site.text.len;
            }
        }
        return bytes;
    }
};

test "HWPX structure values own paragraph order and text independently with bounded clone failure" {
    const a = std.testing.allocator;
    const rows = try a.alloc(@import("text_sites.zig").Site, 1);
    rows[0] = .{ .element_index = 3, .start = 10, .end = 20, .text = try a.dupe(u8, "현재😀") };
    const items = try a.alloc(Paragraph, 2);
    items[0] = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = rows } };
    items[1] = .{ .template_element = 1, .source_ordinal = null, .generated_id = 9, .paragraph_shape_id = 0, .sites = .{ .items = try a.alloc(@import("text_sites.zig").Site, 0) } };
    var original: Values = .{ .paragraphs = items };
    defer original.deinit(a);
    original.paragraphs[0].protected_positions = try a.dupe(ProtectedPosition, &.{.{ .element_index = 7, .unit = 3, .kind = .anchor }});
    original.paragraphs[1].protected_positions = try a.alloc(ProtectedPosition, 0);
    original.paragraphs[0].field_positions = try a.dupe(@import("field_position.zig").Position, &.{.{ .element_index = 4, .begin_element = 4, .kind = .begin, .unit = 3 }});
    original.paragraphs[1].field_positions = try a.alloc(@import("field_position.zig").Position, 0);
    original.paragraphs[0].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, &.{.{ .source_element = 8, .unit = 2, .affinity = .right }});
    original.paragraphs[1].column_boundaries = try a.alloc(@import("column_boundary_position.zig").Position, 0);
    var copy = try original.clone(a);
    defer copy.deinit(a);
    original.paragraphs[0].field_positions.?[0].unit = 4;
    try std.testing.expectEqual(@as(usize, 3), copy.paragraphs[0].field_positions.?[0].unit);
    original.paragraphs[0].field_positions.?[0].unit = 3;
    try std.testing.expect(copy.paragraphs[1].field_positions != null);
    try std.testing.expectEqual(@as(usize, 0), copy.paragraphs[1].field_positions.?.len);
    original.paragraphs[0].column_boundaries.?[0].unit = 3;
    try std.testing.expectEqual(@as(u32, 2), copy.paragraphs[0].column_boundaries.?[0].unit);
    original.paragraphs[0].column_boundaries.?[0].unit = 2;
    try std.testing.expect(copy.paragraphs[1].column_boundaries != null);
    try std.testing.expectEqual(@as(usize, 0), copy.paragraphs[1].column_boundaries.?.len);
    original.paragraphs[0].protected_positions.?[0].unit = 4;
    try std.testing.expectEqual(@as(usize, 3), copy.paragraphs[0].protected_positions.?[0].unit);
    original.paragraphs[0].protected_positions.?[0].unit = 3;
    try std.testing.expect(copy.paragraphs[1].protected_positions != null);
    try std.testing.expectEqual(@as(usize, 0), copy.paragraphs[1].protected_positions.?.len);
    original.paragraphs[0].sites.items[0].text[0] ^= 1;
    try std.testing.expectEqualStrings("현재😀", copy.paragraphs[0].sites.items[0].text);
    original.paragraphs[0].sites.items[0].text[0] ^= 1;
    try std.testing.expectEqual(@as(?usize, null), copy.paragraphs[1].source_ordinal);
    try std.testing.expectEqual(@as(?u32, 9), copy.paragraphs[1].generated_id);
    try std.testing.expectEqual(@as(?u32, null), copy.paragraphs[0].paragraph_shape_id);
    try std.testing.expectEqual(@as(?u32, 0), copy.paragraphs[1].paragraph_shape_id);
    const size = try original.byteSize(10000);
    try std.testing.expectEqual(size, try copy.byteSize(size));
    try std.testing.expectError(error.LimitExceeded, original.byteSize(size - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Values) !void {
            var result = try borrowed.clone(allocator);
            defer result.deinit(allocator);
        }
    }.run, .{&original});
    try std.testing.expectEqualStrings("현재😀", original.paragraphs[0].sites.items[0].text);
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_save.zig").write(a, &tree, &original, .{}, &.{}, 10000));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 0, 0, 10, 10000));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &original.paragraphs[0]));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_splice.zig").splice(a, &tree, &original, 0, 0, 0, "text", 10000));
    for (original.paragraphs) |*paragraph| {
        a.free(paragraph.field_positions.?);
        paragraph.field_positions = null;
    }
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_structure_save.zig").write(a, &tree, &original, .{}, &.{}, 10000));
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 0, 0, 10, 10000));
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000));
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &original.paragraphs[0]));
    try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("paragraph_structure_splice.zig").splice(a, &tree, &original, 0, 0, 0, "text", 10000));
    for (original.paragraphs) |*paragraph| {
        a.free(paragraph.column_boundaries.?);
        paragraph.column_boundaries = null;
    }
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &original, .{}, &.{}, 10000));
    try std.testing.expectError(error.UnsupportedAnchoredStructure, @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 0, 0, 10, 10000));
    try std.testing.expectError(error.UnsupportedAnchoredStructure, @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000));
    try std.testing.expectError(error.UnsupportedAnchoredStructure, @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &original.paragraphs[0]));
    try std.testing.expectError(error.UnsupportedAnchoredStructure, @import("paragraph_structure_splice.zig").splice(a, &tree, &original, 0, 0, 0, "text", 10000));
    try std.testing.expectEqual(@as(usize, 3), original.paragraphs[0].protected_positions.?[0].unit);
}
