const std = @import("std");
const deletion = @import("table_deletion.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const writer = @import("../record_writer.zig");
const rules = @import("../body/control_rules.zig");
const a = std.testing.allocator;
const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };
const limit = 1024 * 1024;
const options: deletion.Options = .{ .max_bytes = limit, .char_shape_count = 2 };

fn record(out: *std.ArrayList(u8), tag: u10, level: u10, payload: []const u8) !void {
    try writer.append(a, out, tag, level, payload, limit);
}

fn anchor(out: *std.ArrayList(u8), id: u32) !void {
    var bytes: [16]u8 = @splat(0);
    std.mem.writeInt(u16, bytes[0..2], 11, .little);
    std.mem.writeInt(u32, bytes[2..6], id, .little);
    std.mem.writeInt(u16, bytes[14..16], 11, .little);
    try out.appendSlice(a, &bytes);
}

fn table(level: u10) ![]u8 {
    const model = @import("../../model/created_table.zig");
    var value = try model.create(a, 100, 101, try @import("../../model/table_creation_plan.zig").create(1, 1, 1000, 1000, 1), &.{102}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer value.deinit(a);
    _ = try value.replaceText(a, 0, 0, "셀", limit);
    return @import("created_table_records.zig").write(a, &value, version, .{
        .common = .{ .flags = 0x6a2211, .offset_y = 0, .offset_x = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    }, .{ .paragraphs = .{ .char_shapes = 2, .para_shapes = 1, .styles = 1 }, .border_count = 1 }, level, .{ .max_cells = 1, .max_bytes = limit });
}

const FixtureOptions = struct { nested: bool = false, range_start: ?u32 = null, range_end: u32 = 0 };
fn fixture(config: FixtureOptions) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    try text.appendSlice(a, &.{ 'A', 0 });
    try anchor(&text, rules.table_id);
    try text.appendSlice(a, &.{ 'B', 0 });
    try anchor(&text, rules.table_id);
    try text.appendSlice(a, &.{ 'C', 0 });
    try anchor(&text, rules.drawing_id);
    try text.appendSlice(a, &.{ 'D', 0, 13, 0 });
    var header: [24]u8 = @splat(0);
    body.Header.writeTextCounts(&header, @intCast(text.items.len / 2), 2, if (config.range_start != null) 1 else 0);
    std.mem.writeInt(u32, header[0..4], 0x80000000 | @as(u32, @intCast(text.items.len / 2)), .little);
    std.mem.writeInt(u32, header[4..8], (1 << 11) | (1 << 13) | (1 << 30), .little);
    std.mem.writeInt(u16, header[16..18], 1, .little);
    try record(&out, 66, 0, &header);
    try record(&out, 67, 1, text.items);
    const runs = try @import("character_run_payload.zig").encode(a, &.{ .{ .start_unit = 0, .char_shape_id = 0 }, .{ .start_unit = 11, .char_shape_id = 1 } });
    defer a.free(runs);
    try record(&out, 68, 1, runs);
    const line: [36]u8 = @splat(0);
    try record(&out, 69, 1, &line);
    if (config.range_start) |start| {
        var range: [12]u8 = @splat(0);
        std.mem.writeInt(u32, range[0..4], start, .little);
        std.mem.writeInt(u32, range[4..8], config.range_end, .little);
        std.mem.writeInt(u32, range[8..12], 0xa5001234, .little);
        try record(&out, 70, 1, &range);
    }
    const first = try table(1);
    defer a.free(first);
    if (config.nested) {
        var it = @import("../record.zig").Iterator.init(first, .{});
        var nested_text: std.ArrayList(u8) = .empty;
        defer nested_text.deinit(a);
        try nested_text.appendSlice(a, &.{ 'N', 0 });
        try anchor(&nested_text, rules.table_id);
        try nested_text.appendSlice(a, &.{ 'M', 0, 13, 0 });
        while (try it.next()) |r| {
            switch (r.tag) {
                66 => {
                    const h = try a.dupe(u8, r.payload);
                    defer a.free(h);
                    body.Header.writeTextCounts(h, @intCast(nested_text.items.len / 2), 1, 0);
                    std.mem.writeInt(u32, h[4..8], (1 << 11) | (1 << 13), .little);
                    try record(&out, r.tag, r.level, h);
                },
                67 => try record(&out, r.tag, r.level, nested_text.items),
                68 => {
                    try out.appendSlice(a, r.raw);
                    const inner = try table(r.level);
                    defer a.free(inner);
                    try out.appendSlice(a, inner);
                },
                else => try out.appendSlice(a, r.raw),
            }
        }
    } else try out.appendSlice(a, first);
    const second = try table(1);
    defer a.free(second);
    try out.appendSlice(a, second);
    var drawing: [4]u8 = undefined;
    std.mem.writeInt(u32, &drawing, rules.drawing_id, .little);
    try record(&out, 71, 1, &drawing);
    return out.toOwnedSlice(a);
}

fn tableNodes(allocator: std.mem.Allocator, bytes: []const u8) ![]usize {
    var tree = try Tree.parseTextPreview(allocator, bytes, version, .{});
    defer tree.deinit(allocator);
    var rows: std.ArrayList(usize) = .empty;
    errdefer rows.deinit(allocator);
    for (tree.nodes, 0..) |node, i| if (node.record.framing.tag == 77) try rows.append(allocator, i);
    return rows.toOwnedSlice(allocator);
}

fn hostText(bytes: []const u8) ![]const u8 {
    var it = @import("../record.zig").Iterator.init(bytes, .{});
    _ = try it.next();
    return (try it.next()).?.payload;
}

test "HWP5 표 전체 삭제 단일 대상과 형제 원문 보존" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    const after = try deletion.prepareMany(a, before, version, nodes[0..1], options);
    defer a.free(after);
    const remaining = try tableNodes(a, after);
    defer a.free(remaining);
    try std.testing.expectEqual(@as(usize, 1), remaining.len);
    const sibling = try table(1);
    defer a.free(sibling);
    try std.testing.expect(std.mem.indexOf(u8, after, sibling) != null);
    const old = try hostText(before);
    const current = try hostText(after);
    try std.testing.expectEqualSlices(u8, old[0..2], current[0..2]);
    try std.testing.expectEqualSlices(u8, old[18..], current[2..]);
}

test "HWP5 표 전체 삭제 같은 호스트 역순 배치와 그림 유지" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    const after = try deletion.prepareMany(a, before, version, &.{ nodes[1], nodes[0] }, options);
    defer a.free(after);
    const remaining = try tableNodes(a, after);
    defer a.free(remaining);
    try std.testing.expectEqual(@as(usize, 0), remaining.len);
    const text = try hostText(after);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0, 'C', 0 }, text[0..6]);
    var it = @import("../record.zig").Iterator.init(after, .{});
    const header = try body.Header.parse((try it.next()).?.payload, version);
    try std.testing.expect(header.control_mask & (1 << 11) != 0);
    try std.testing.expect(header.control_mask & (1 << 30) != 0);
    try std.testing.expect(header.countHighBit());
}

test "HWP5 표 전체 삭제 중복과 잘못된 원본 노드 거부" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    try std.testing.expectError(error.DuplicateTableDeletionTarget, deletion.prepareMany(a, before, version, &.{ nodes[0], nodes[0] }, options));
    try std.testing.expectError(error.InvalidTableDeletionTarget, deletion.prepareMany(a, before, version, &.{nodes[0] - 1}, options));
    try std.testing.expectError(error.InvalidTableDeletionTarget, deletion.prepareMany(a, before, version, &.{std.math.maxInt(usize)}, options));
}

test "HWP5 표 전체 삭제 빈 선택과 실제 한도 초과 거부" {
    try std.testing.expectError(error.InvalidTableDeletionTargets, deletion.prepareMany(a, &.{}, version, &.{}, options));
    const oversized = try a.alloc(usize, 4097);
    defer a.free(oversized);
    @memset(oversized, 0);
    try std.testing.expectError(error.InvalidTableDeletionTargets, deletion.prepareMany(a, &.{}, version, oversized, options));
}

test "HWP5 표 전체 삭제 중첩 대상만 제거하고 바깥 표 보존" {
    const before = try fixture(.{ .nested = true });
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 3), nodes.len);
    const after = try deletion.prepareMany(a, before, version, nodes[1..2], options);
    defer a.free(after);
    const remaining = try tableNodes(a, after);
    defer a.free(remaining);
    try std.testing.expectEqual(@as(usize, 2), remaining.len);
    try std.testing.expectEqualSlices(u8, try hostText(before), try hostText(after));
    try std.testing.expect(std.mem.indexOf(u8, after, &.{ 'N', 0, 'M', 0, 13, 0 }) != null);
}

test "HWP5 표 전체 삭제 조상 자손 동시 선택 거부" {
    const before = try fixture(.{ .nested = true });
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    try std.testing.expectError(error.OverlappingTableDeletionTargets, deletion.prepareMany(a, before, version, nodes[0..2], options));
}

test "HWP5 표 전체 삭제 원본 앵커 불일치 거부와 입력 불변" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    const text = try hostText(before);
    const at = @intFromPtr(text.ptr) - @intFromPtr(before.ptr) + 4;
    before[at] ^= 1;
    const snapshot = try a.dupe(u8, before);
    defer a.free(snapshot);
    try std.testing.expectError(error.ControlIdMismatch, deletion.prepareMany(a, before, version, nodes[0..1], options));
    try std.testing.expectEqualSlices(u8, snapshot, before);
}

test "HWP5 표 전체 삭제 겹치는 범위 태그는 의미 추론 없이 거부" {
    const before = try fixture(.{ .range_start = 0, .range_end = 10 });
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    try std.testing.expectError(error.UnsupportedRangeSemantics, deletion.prepareMany(a, before, version, nodes[0..1], options));
}

test "HWP5 표 전체 삭제 분리된 범위 태그 좌표와 원시 값 보존" {
    const before = try fixture(.{ .range_start = 27, .range_end = 28 });
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    const after = try deletion.prepareMany(a, before, version, nodes[0..1], options);
    defer a.free(after);
    var it = @import("../record.zig").Iterator.init(after, .{});
    var found = false;
    while (try it.next()) |r| if (r.tag == 70) {
        const range = (try body.Ranges.parse(r.payload)).get(0).?;
        try std.testing.expectEqual(@as(u32, 19), range.start);
        try std.testing.expectEqual(@as(u32, 20), range.end);
        try std.testing.expectEqual(@as(u32, 0xa5001234), range.tag);
        found = true;
    };
    try std.testing.expect(found);
}

test "HWP5 표 전체 삭제 스타일 경계와 호스트 줄 캐시 보정" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    const after = try deletion.prepareMany(a, before, version, nodes[0..2], options);
    defer a.free(after);
    var it = @import("../record.zig").Iterator.init(after, .{});
    const header = try body.Header.parse((try it.next()).?.payload, version);
    try std.testing.expectEqual(@as(u16, 0), header.line_segment_count);
    try std.testing.expectEqual(@as(u32, 13), header.characterUnits());
    _ = try it.next();
    const runs = try body.Runs.parse((try it.next()).?.payload);
    try std.testing.expectEqual(@as(usize, 2), runs.count());
    try std.testing.expectEqual(@as(u32, 2), runs.get(1).?.start);
    try std.testing.expectEqual(@as(u32, 1), runs.get(1).?.char_shape_id);
}

test "HWP5 표 전체 삭제 한도 실패는 원본을 변경하지 않음" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    var small = options;
    small.max_bytes = before.len - 1;
    const digest = std.crypto.hash.sha2.Sha256.hash;
    var old: [32]u8 = undefined;
    var current: [32]u8 = undefined;
    digest(before, &old, .{});
    try std.testing.expectError(error.LimitExceeded, deletion.prepareMany(a, before, version, nodes[0..1], small));
    digest(before, &current, .{});
    try std.testing.expectEqualSlices(u8, &old, &current);
}

test "HWP5 표 전체 삭제 모든 할당 실패 원자성" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, targets: []const usize) !void {
            const after = try deletion.prepareMany(allocator, source, version, targets, options);
            defer allocator.free(after);
        }
    }.run, .{ before, nodes[0..2] });
}

test "HWP5 표 전체 삭제 호스트 주석 연결 문맥 거부" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    var tree = try Tree.parseTextPreview(a, before, version, .{});
    defer tree.deinit(a);
    const text = try hostText(before);
    const start = @intFromPtr(text.ptr) - @intFromPtr(before.ptr) + 2;
    std.mem.writeInt(u16, before[start..][0..2], 17, .little);
    std.mem.writeInt(u32, before[start + 2 ..][0..4], rules.id("fn  "), .little);
    std.mem.writeInt(u16, before[start + 14 ..][0..2], 17, .little);
    const control = tree.nodes[nodes[0]].parent.?;
    const payload = tree.nodes[control].record.framing.payload;
    const offset = @intFromPtr(payload.ptr) - @intFromPtr(before.ptr);
    std.mem.writeInt(u32, before[offset..][0..4], rules.id("fn  "), .little);
    try std.testing.expectError(error.UnsupportedTableDeletionContext, deletion.prepareMany(a, before, version, nodes[1..2], options));
}

test "HWP5 표 전체 삭제 잘못된 글자 자원 참조 거부" {
    const before = try fixture(.{});
    defer a.free(before);
    const nodes = try tableNodes(a, before);
    defer a.free(nodes);
    var invalid = options;
    invalid.char_shape_count = 1;
    try std.testing.expectError(error.InvalidResourceReference, deletion.prepareMany(a, before, version, nodes[0..1], invalid));
}

test "HWP5 표 전체 삭제 형제 그림이 없는 호스트 개체 마스크 제거" {
    const original = try fixture(.{});
    defer a.free(original);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var it = @import("../record.zig").Iterator.init(original, .{});
    var root = true;
    // 원본 prefix 19단위 뒤의 그림 앵커를 제거한 text payload를 교체한다.
    while (try it.next()) |r| {
        if (r.tag == 71 and (try body.ControlHeader.parse(r.payload)).id == rules.drawing_id) continue;
        if (root and r.tag == 66) {
            const header = try a.dupe(u8, r.payload);
            defer a.free(header);
            std.mem.writeInt(u32, header[0..4], 0x80000000 | 21, .little);
            try record(&out, r.tag, r.level, header);
        } else if (root and r.tag == 67) {
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(a);
            try text.appendSlice(a, r.payload[0..38]);
            try text.appendSlice(a, r.payload[54..]);
            try record(&out, r.tag, r.level, text.items);
        } else try out.appendSlice(a, r.raw);
        if (r.tag == 71) root = false;
    }
    const nodes = try tableNodes(a, out.items);
    defer a.free(nodes);
    const after = try deletion.prepareMany(a, out.items, version, nodes, options);
    defer a.free(after);
    var current = @import("../record.zig").Iterator.init(after, .{});
    const header = try body.Header.parse((try current.next()).?.payload, version);
    try std.testing.expect(header.control_mask & (1 << 11) == 0);
    try std.testing.expect(header.control_mask & (1 << 30) != 0);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0, 'C', 0, 'D', 0, 13, 0 }, try hostText(after));
}

test "표 삭제 보호 H5 문단 사이 hyperlink 안의 표는 거부" {
    const original = try fixture(.{});
    defer a.free(original);
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    for (0..2) |side| {
        var header: [24]u8 = @splat(0);
        body.Header.writeTextCounts(&header, 9, 1, 0);
        try record(&source, 66, 0, &header);
        var text: [18]u8 = @splat(0);
        const code: u16 = if (side == 0) 3 else 4;
        std.mem.writeInt(u16, text[0..2], code, .little);
        std.mem.writeInt(u16, text[14..16], code, .little);
        std.mem.writeInt(u16, text[16..18], 13, .little);
        if (side == 0) std.mem.writeInt(u32, text[2..6], rules.id("%hlk"), .little);
        try record(&source, 67, 1, &text);
        try record(&source, 68, 1, &@as([8]u8, @splat(0)));
        if (side == 0) {
            var properties: [15]u8 = @splat(0);
            std.mem.writeInt(u32, properties[0..4], rules.id("%hlk"), .little);
            try record(&source, 71, 1, &properties);
            try source.appendSlice(a, original);
        }
    }
    const nodes = try tableNodes(a, source.items);
    defer a.free(nodes);
    if (deletion.prepareMany(a, source.items, version, nodes[0..1], options)) |candidate| {
        a.free(candidate);
        return error.ExpectedProtectionRejection;
    } else |err| try std.testing.expectEqual(error.ProtectedFieldRange, err);
}
