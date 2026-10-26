//! 검증된 원본 소유 필드 외부 범위의 삽입 위치만 선택합니다.
const std = @import("std");
const positions = @import("paragraph_text_positions.zig");
const transaction = @import("text_splice_transaction.zig");
const Sites = @import("text_sites.zig").Sites;
const Range = @import("field_text_ranges.zig").Range;

pub fn fromSession(session: anytype, section: usize, sites: *const Sites, segments: []const positions.Segment, start: u32, deleted: u32) !usize {
    var lease = try @import("source_field_analysis.zig").leaseForExterior(session);
    defer lease.deinit(session.allocator);
    return select(sites, segments, lease.source.fields, section, start, deleted);
}

/// 호출자가 원본 topology와 외부 편집 범위를 먼저 검증해야 합니다.
/// 이동한 current field_positions에는 원본 offset으로 소유권을 추정하지 않습니다.
pub fn select(sites: *const Sites, segments: []const positions.Segment, fields: []const Range, section: usize, start: u32, deleted: u32) !usize {
    const left = transaction.insertionSite(sites, segments, start) orelse return error.InvalidTextPosition;
    if (deleted == 0) return left;
    for (fields) |field| {
        const span = @import("field_text_positions.zig").project(field, section, segments) orelse continue;
        if (span.end_unit != start) continue;
        for (segments) |segment| {
            if (segment.kind != .text or segment.index != left) continue;
            if (segment.source_start < field.content_start or segment.source_start >= field.content_end) continue;
            const right = transaction.replacementInsertionSite(sites, segments, start, deleted) orelse return error.InvalidTextPosition;
            for (segments) |candidate| {
                if (candidate.kind != .text or candidate.index != right or start < candidate.start_unit or start >= candidate.end_unit) continue;
                if (candidate.source_start >= field.content_start and candidate.source_start < field.content_end) return error.ProtectedFieldRange;
                return right;
            }
            return error.InvalidTextPosition;
        }
    }
    return left;
}

test "source field exterior insertion owner moves only a protected field end" {
    const field: Range = .{ .section = 0, .begin_marker = 0, .end_marker = 1, .content_start = 10, .content_end = 20 };
    const sites = Sites{ .items = @constCast(&[_]@import("text_sites.zig").Site{
        .{ .element_index = 0, .start = 12, .end = 13, .text = @constCast("A") },
        .{ .element_index = 1, .start = 30, .end = 31, .text = @constCast("B") },
        .{ .element_index = 2, .start = 40, .end = 41, .text = @constCast("C") },
    }) };
    const segments = [_]positions.Segment{
        .{ .kind = .text, .index = 0, .source_start = 12, .start_unit = 0, .end_unit = 1 },
        .{ .kind = .text, .index = 1, .source_start = 30, .start_unit = 1, .end_unit = 2 },
        .{ .kind = .text, .index = 2, .source_start = 40, .start_unit = 2, .end_unit = 3 },
    };
    try std.testing.expectEqual(@as(usize, 1), try select(&sites, &segments, &.{field}, 0, 1, 1));
    // 필드 밖 titleMark를 가로지르는 교체도 기존 left 위치를 유지합니다.
    try std.testing.expectEqual(@as(usize, 1), try select(&sites, &segments, &.{field}, 0, 2, 1));
    try std.testing.expectEqual(@as(usize, 0), try select(&sites, &segments, &.{field}, 0, 1, 0));
}

test "source field exterior insertion owner preserves an outside empty boundary site" {
    const field: Range = .{ .section = 0, .begin_marker = 0, .end_marker = 1, .content_start = 10, .content_end = 20 };
    const sites = Sites{ .items = @constCast(&[_]@import("text_sites.zig").Site{
        .{ .element_index = 0, .start = 12, .end = 13, .text = @constCast("A") },
        .{ .element_index = 1, .start = 17, .end = 17, .text = @constCast(""), .anchor_boundary = true },
        .{ .element_index = 2, .start = 30, .end = 30, .text = @constCast("") },
        .{ .element_index = 3, .start = 40, .end = 41, .text = @constCast("Z") },
    }) };
    const segments = [_]positions.Segment{
        .{ .kind = .text, .index = 0, .source_start = 12, .start_unit = 0, .end_unit = 1 },
        .{ .kind = .tab, .index = 9, .source_start = 15, .start_unit = 1, .end_unit = 2 },
        .{ .kind = .text, .index = 1, .source_start = 17, .start_unit = 2, .end_unit = 2 },
        .{ .kind = .text, .index = 2, .source_start = 30, .start_unit = 2, .end_unit = 2 },
        .{ .kind = .text, .index = 3, .source_start = 40, .start_unit = 2, .end_unit = 3 },
    };
    try std.testing.expectEqual(@as(usize, 2), try select(&sites, &segments, &.{field}, 0, 2, 1));
}
