//! 원본 표와 결속된 앵커만 제거한다. 열린 Session이나 자원 수명은 변경하지 않는다.
const std = @import("std");
const body = @import("../body/reader.zig");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const rules = @import("../body/control_rules.zig");
const max_targets = @import("../../model/cell_edit_budget.zig").max_cells;

pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_records: usize = 1_000_000,
    char_shape_count: usize,
};

/// 호출자가 해제하는 새 구역 바이트. 모든 검사는 비공개 후보에서 수행한다.
/// 여러 표를 같은 호스트에서 제거해도 문단마다 한 번만 좌표를 변환한다.
pub fn prepareMany(a: std.mem.Allocator, source: []const u8, version: Version, table_nodes: []const usize, options: Options) ![]u8 {
    if (source.len > options.max_bytes) return error.LimitExceeded;
    if (table_nodes.len == 0 or table_nodes.len > max_targets) return error.InvalidTableDeletionTargets;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    // 기존 선택 구역 정책을 완화하지 않는다. 미해석 외부 위치 필드도 거부한다.
    try @import("source_policy.zig").validate(scratch, source, version);
    const tree = try Tree.parseTextPreview(scratch, source, version, .{ .max_records = options.max_records });
    try @import("field_free_section.zig").validate(tree);
    var groups = try @import("paragraph_owner.zig").inspectGroups(scratch, tree, version);
    defer groups.deinit(scratch);
    try @import("control_source.zig").validate(scratch, tree);
    var links = try @import("../body/control_links.zig").Links.build(scratch, tree);
    defer links.deinit(scratch);
    const n = tree.nodes.len;
    const requested = try scratch.alloc(bool, n);
    const selected = try scratch.alloc(bool, n);
    const deleted = try scratch.alloc(bool, n);
    const hosts = try scratch.alloc(bool, n);
    const protected = try scratch.alloc(bool, n);
    @memset(requested, false);
    @memset(selected, false);
    @memset(deleted, false);
    @memset(hosts, false);
    @memset(protected, false);
    for (table_nodes) |node| {
        if (node >= n or tree.nodes[node].record.value != .table) return error.InvalidTableDeletionTarget;
        if (requested[node]) return error.DuplicateTableDeletionTarget;
        requested[node] = true;
    }
    var remove_offsets: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer remove_offsets.deinit(scratch);
    var matched: usize = 0;
    // 각 표의 직접 자식은 전체 링크 순회에서 한 번씩만 조사된다.
    for (links.items) |link| {
        if (link.header_id != rules.table_id) continue;
        const lists = try @import("../body/table_lists.zig").Iterator.init(tree, link.control_node);
        if (!requested[lists.table_node]) continue;
        if (link.code != 11 or link.id != rules.table_id or link.identity != .exact) return error.SourceBindingMismatch;
        if (tree.nodes[link.control_node].parent != link.paragraph_node) return error.SourceBindingMismatch;
        if (link.start_unit > std.math.maxInt(u32) - 8) return error.LimitExceeded;
        const text = tree.nodes[link.text_node].record.framing.payload;
        if (link.start_unit * 2 + 16 > text.len) return error.SourceBindingMismatch;
        const offset = @intFromPtr(text.ptr) - @intFromPtr(source.ptr) + link.start_unit * 2;
        if ((try remove_offsets.getOrPut(scratch, offset)).found_existing) return error.SourceBindingMismatch;
        selected[link.control_node] = true;
        hosts[link.paragraph_node] = true;
        matched += 1;
    }
    if (matched != table_nodes.len) return error.SourceBindingMismatch;
    for (links.items) |link| {
        if (hosts[link.paragraph_node] and link.code != 2 and link.code != 11) return error.UnsupportedTableDeletionContext;
    }
    var end: usize = 0;
    for (tree.nodes, 0..) |node, i| {
        if (node.parent) |parent| protected[i] = protected[parent];
        if (node.record.value == .control_header) {
            const id = node.record.value.control_header.id;
            const code = rules.expectedCode(id);
            // 삭제 범위와 호스트의 소유 계층에 있는 필드·주석·미확인 연결은 거부한다.
            if (code == null or code.? == 3 or code.? == 15 or code.? == 16 or code.? == 17 or code.? == 22 or id == rules.form_id)
                protected[i] = true;
        }
        if (node.record.framing.tag == @backingInt(body.Tag.memo_list)) protected[i] = true;
        if (selected[i]) {
            if (i < end) return error.OverlappingTableDeletionTargets;
            if (protected[i]) return error.UnsupportedTableDeletionContext;
            end = node.subtree_end;
        }
        deleted[i] = i < end;
        if ((deleted[i] or hosts[i]) and protected[i]) return error.UnsupportedTableDeletionContext;
        if (hosts[i]) {
            // 중첩 표의 셀 문단은 허용하되 도형·주석 등 다른 소유자를 추론하지 않는다.
            if (node.parent) |parent| {
                if (tree.nodes[parent].record.value != .control_header or tree.nodes[parent].record.value.control_header.id != rules.table_id)
                    return error.UnsupportedTableDeletionContext;
            }
        }
    }
    const document = try @import("../model_projection.zig").fromDecodedSections(scratch, version, &.{source});
    const section = &document.sections[0];
    for (section.paragraphs) |*paragraph| {
        const node = try paragraph.originalNode();
        if (hosts[node]) try patchHost(scratch, source, tree, node, paragraph, &remove_offsets, options.char_shape_count);
    }
    // 기존 문단 writer가 counts, shape/range payload와 호스트 line cache를 담당한다.
    const normalized = try @import("text_section_writer.zig").write(scratch, source, section.*, version, options.max_bytes);
    var it = @import("../record.zig").Iterator.init(normalized, .{ .max_records = options.max_records });
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(scratch);
    for (tree.nodes, 0..) |node, i| {
        const host_record = if (node.parent) |parent| hosts[parent] else false;
        if (host_record and node.record.framing.tag == @backingInt(body.Tag.line_segments)) continue;
        const current = (try it.next()) orelse return error.SourceBindingMismatch;
        if (current.tag != node.record.framing.tag or current.level != node.record.framing.level) return error.SourceBindingMismatch;
        if (deleted[i]) continue;
        if (hosts[i]) {
            // code 11은 표·그림·수식이 공유한다. 남아 있는 개체 토큰이 있으면 유지한다.
            const bytes = try scratch.dupe(u8, current.raw);
            const payload = bytes[bytes.len - current.payload.len ..];
            var present = false;
            const parts = try @import("../body/paragraph_children.zig").collect(tree, i);
            const text = tree.nodes[parts.text_node.?].record.framing.payload;
            var tokens = try body.text.Iterator.init(text);
            while (try tokens.next()) |token| {
                if (token.value == .control and token.value.control.code == 11 and !remove_offsets.contains(@intFromPtr(token.raw.ptr) - @intFromPtr(source.ptr))) present = true;
            }
            const mask = payload[body.Header.control_mask_offset..][0..4];
            const old = std.mem.readInt(u32, mask, .little);
            std.mem.writeInt(u32, mask, (old & ~@as(u32, 1 << 11)) | (if (present) @as(u32, 1 << 11) else 0), .little);
            try out.appendSlice(scratch, bytes);
        } else try out.appendSlice(scratch, current.raw);
        if (out.items.len > options.max_bytes) return error.LimitExceeded;
    }
    if (try it.next() != null) return error.SourceBindingMismatch;
    // 갱신된 토큰/제어 subtree의 일대일 결속을 게시 전에 다시 확인한다.
    const verified = try Tree.parseTextPreview(scratch, out.items, version, .{ .max_records = options.max_records });
    try @import("control_source.zig").validate(scratch, verified);
    _ = try @import("../model_projection.zig").fromDecodedSections(scratch, version, &.{out.items});
    return a.dupe(u8, out.items);
}

fn patchHost(a: std.mem.Allocator, source: []const u8, tree: Tree, node: usize, paragraph: *model.Paragraph, offsets: *const std.AutoHashMapUnmanaged(usize, void), char_count: usize) !void {
    var parts = try @import("../body/paragraph_children.zig").collect(tree, node);
    const text_node = parts.text_node orelse return error.SourceBindingMismatch;
    const before = tree.nodes[text_node].record.value.text.raw;
    try @import("control_boundaries.zig").validateRetainedText(before);
    if (before.len < 2 or std.mem.readInt(u16, before[before.len - 2 ..][0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
    var child = node + 1;
    while (child < tree.nodes[node].subtree_end) {
        const entry = tree.nodes[child];
        switch (entry.record.framing.tag) {
            68 => parts.metadata.runs = try body.Runs.parse(entry.record.framing.payload),
            69 => parts.metadata.lines = try body.Segments.parse(entry.record.framing.payload),
            70 => parts.metadata.ranges = try body.Ranges.parse(entry.record.framing.payload),
            67, 71 => {},
            else => return error.UnsupportedTableDeletionContext,
        }
        child = entry.subtree_end;
    }
    try parts.metadata.validate(tree.nodes[node].record.value.header, char_count);
    try @import("character_runs.zig").validate(paragraph.character_runs, before, char_count);
    const units = before.len / 2;
    const removed = try a.alloc(bool, units);
    @memset(removed, false);
    var after: std.ArrayList(u8) = .empty;
    var tokens = try body.text.Iterator.init(before);
    while (try tokens.next()) |token| {
        const offset = @intFromPtr(token.raw.ptr) - @intFromPtr(source.ptr);
        if (offsets.contains(offset)) {
            if (token.value != .control or token.value.control.code != 11 or token.raw.len != 16) return error.SourceBindingMismatch;
            @memset(removed[token.start_unit..][0..8], true);
        } else {
            if (token.value == .control and (token.value.control.code == 3 or token.value.control.code == 4)) return error.UnsupportedTableDeletionContext;
            try after.appendSlice(a, token.raw);
        }
    }
    const prefix = try a.alloc(u32, units + 1);
    prefix[0] = 0;
    for (removed, 0..) |value, i| prefix[i + 1] = prefix[i] + @as(u32, @intFromBool(value));
    var runs: std.ArrayList(model.CharacterRun) = .empty;
    // 삭제 안에서 시작한 스타일도 바로 뒤의 남은 문자에는 적용될 수 있다.
    // 실제 생존 문자별 현재 run을 한 번 순회해 경계를 복구한다.
    var ri: usize = 0;
    for (removed, 0..) |value, i| {
        while (ri + 1 < paragraph.character_runs.len and paragraph.character_runs[ri + 1].start_unit <= i) ri += 1;
        if (value) continue;
        const id = paragraph.character_runs[ri].char_shape_id;
        if (runs.items.len == 0 or runs.items[runs.items.len - 1].char_shape_id != id)
            try runs.append(a, .{ .start_unit = @as(u32, @intCast(i)) - prefix[i], .char_shape_id = id });
    }
    const tail = paragraph.character_runs[paragraph.character_runs.len - 1];
    if (tail.start_unit == units and (runs.items.len == 0 or runs.items[runs.items.len - 1].char_shape_id != tail.char_shape_id))
        try runs.append(a, .{ .start_unit = @as(u32, @intCast(units)) - prefix[units], .char_shape_id = tail.char_shape_id });
    var ranges: std.ArrayList(model.TextRange) = .empty;
    if (parts.metadata.ranges) |values| for (0..values.count()) |i| {
        const range = values.get(i).?;
        try @import("plain_text_content.zig").boundary(before, range.start);
        try @import("plain_text_content.zig").boundary(before, range.end);
        if (prefix[range.start] != prefix[range.end] or touches(removed, range.start) or touches(removed, range.end)) return error.UnsupportedRangeSemantics;
        try ranges.append(a, .{ .start_unit = range.start - prefix[range.start], .end_unit = range.end - prefix[range.end], .tag = range.tag });
    };
    paragraph.tokens = try @import("token_ownership.zig").fromText(a, after.items);
    paragraph.character_runs = try runs.toOwnedSlice(a);
    paragraph.range_tags = try ranges.toOwnedSlice(a);
    paragraph.declared_units = @intCast(after.items.len / 2);
}

fn touches(removed: []const bool, at: usize) bool {
    return (at < removed.len and removed[at]) or (at > 0 and removed[at - 1]);
}
