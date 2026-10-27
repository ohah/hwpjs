//! HWP5 변경 UTF16/run 메타데이터. Session gap과 r5 전체 draft fallback을 구분한다.
const std = @import("std");
const model = @import("../../model/document.zig");
const journal = @import("../../model/history_text_delta_journal.zig");
const epochs = @import("../../model/history_mutation_epoch.zig");
const plain = @import("plain_text.zig");
pub const Meta = struct {
    source_node: ?u32,
    parent_node: ?u32,
    declared_units: u32,
    text_present: bool,
    para_shape_id: u16,
    style_id: u8,
    deferred: usize,
    range_present: bool,
    runs: []model.CharacterRun,
    pub fn capture(a: std.mem.Allocator, p: model.Paragraph) !Meta {
        return .{ .source_node = p.source_node, .parent_node = p.parent_node, .declared_units = p.declared_units, .text_present = p.text_present, .para_shape_id = p.para_shape_id, .style_id = p.style_id, .deferred = p.deferred_direct_records, .range_present = p.range_tags != null, .runs = try a.dupe(model.CharacterRun, p.character_runs) };
    }
    pub fn deinit(self: *Meta, a: std.mem.Allocator) void {
        a.free(self.runs);
    }
    pub fn matches(self: Meta, p: model.Paragraph) bool {
        return self.source_node == p.source_node and self.parent_node == p.parent_node and
            self.declared_units == p.declared_units and self.text_present == p.text_present and
            self.para_shape_id == p.para_shape_id and self.style_id == p.style_id and self.deferred == p.deferred_direct_records and
            (p.range_tags != null) == self.range_present and (p.range_tags == null or p.range_tags.?.len == 0) and p.field_attributes == null and p.formula_results == null and std.meta.eql(self.runs.len, p.character_runs.len) and blk: {
            for (self.runs, p.character_runs) |a, b| if (!std.meta.eql(a, b)) break :blk false;
            break :blk true;
        };
    }
};
pub const Delta = struct {
    allocator: std.mem.Allocator,
    section: usize,
    paragraph: usize,
    record: journal.Record,
    before: Meta,
    after: Meta,
    pub fn deinit(self: *Delta) void {
        self.record.deinit();
        self.before.deinit(self.allocator);
        self.after.deinit(self.allocator);
    }
};
// canonical Paragraph/token borrow를 보관하지 않는 독립 소유 메타데이터.
pub const LiveDraft = struct {
    runs: []model.CharacterRun,
    ranges: ?[]model.TextRange,
    declared_units: u32,
    deferred: usize,
    incarnation: u64,
    expected_serial: u64,
    transaction_epoch: u64,
};
pub const Prepared = struct {
    allocator: std.mem.Allocator,
    draft: ?model.Paragraph = null,
    live: ?LiveDraft = null,
    delta: Delta,
    reversed: bool = false,
    before_cost: usize,
    after_cost: usize,
    changed: bool,
    pub fn releaseDraft(self: *Prepared) void {
        if (self.live) |live| {
            self.allocator.free(live.runs);
            if (live.ranges) |ranges| self.allocator.free(ranges);
            self.live = null;
        }
        if (self.draft) |*draft| draft.deinit(self.allocator);
        self.draft = null;
    }
    pub fn deinit(self: *Prepared) void {
        self.releaseDraft();
        self.delta.deinit();
    }
};
fn units(a: std.mem.Allocator, bytes: []const u8) ![]u16 {
    if (bytes.len % 2 != 0) return error.InvalidTextSize;
    const out = try a.alloc(u16, bytes.len / 2);
    for (out, 0..) |*v, i| v.* = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
    return out;
}
fn utf8(a: std.mem.Allocator, values: []const u16) ![]u8 {
    const little = try a.alloc(u16, values.len);
    defer a.free(little);
    for (values, little) |v, *out| out.* = std.mem.nativeToLittle(u16, v);
    return std.unicode.utf16LeToUtf8Alloc(a, little);
}
/// checkpoint payload와 동일한 paragraph 가변 비용. 상위 고정 구조 크기는 변하지 않는다.
pub fn cost(p: model.Paragraph) !usize {
    var n = try std.math.mul(usize, p.tokens.len, @sizeOf(model.Token));
    for (p.tokens) |t| n = try std.math.add(usize, n, t.raw.len);
    n = try std.math.add(usize, n, try std.math.mul(usize, p.character_runs.len, @sizeOf(model.CharacterRun)));
    if ((p.range_tags != null and p.range_tags.?.len != 0) or p.field_attributes != null or p.formula_results != null) return error.HistoryDeltaCoverageIncomplete;
    return n;
}
pub fn prepare(live_a: std.mem.Allocator, storage: std.mem.Allocator, binding: epochs.Binding, source: []const u8, version: @import("../version.zig").Version, p: model.Paragraph, edit: plain.Splice, char_count: usize, limit: usize) !Prepared {
    const before = try @import("plain_text_content.zig").editableTextBytes(live_a, p);
    defer live_a.free(before);
    try @import("control_boundaries.zig").validate(before, edit.start_unit, edit.end_unit);
    const add_le = try std.unicode.utf8ToUtf16LeAlloc(live_a, edit.utf8);
    defer live_a.free(add_le);
    const remove_units = try units(live_a, before[@as(usize, edit.start_unit) * 2 .. @as(usize, edit.end_unit) * 2]);
    defer live_a.free(remove_units);
    const add_units = try live_a.alloc(u16, add_le.len);
    defer live_a.free(add_units);
    for (add_le, add_units) |v, *out| out.* = std.mem.littleToNative(u16, v);
    var record = try journal.Record.prepare(storage, binding, .{ .range = .{ .owner = binding.owner, .start = edit.start_unit }, .remove = remove_units, .insert = add_units }, limit);
    errdefer record.deinit();
    var draft = try @import("../../model/clone.zig").paragraph(live_a, p);
    errdefer draft.deinit(live_a);
    // 기존 source/제어/UTF16/run/range 정책을 그대로 사용한다. live 모델은 아직 쓰지 않는다.
    try plain.apply(live_a, source, version, &draft, edit, char_count);
    var before_meta = try Meta.capture(storage, p);
    errdefer before_meta.deinit(storage);
    var after_meta = try Meta.capture(storage, draft);
    errdefer after_meta.deinit(storage);
    return .{ .allocator = live_a, .draft = draft, .delta = .{ .allocator = storage, .section = edit.section, .paragraph = edit.paragraph, .record = record, .before = before_meta, .after = after_meta }, .before_cost = try cost(p), .after_cost = try cost(draft), .changed = !std.mem.eql(u16, record.removed, record.inserted) };
}
/// immutable retained record의 상태를 바꾸지 않고 coordinator 방향을 적용한다.
pub fn restoreDraft(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, p: model.Paragraph, d: *const Delta, redo: bool, char_count: usize) !model.Paragraph {
    const expected = if (redo) d.before else d.after;
    const target = if (redo) d.after else d.before;
    if (!expected.matches(p)) return error.HistoryCurrentMismatch;
    const removed = if (redo) d.record.removed else d.record.inserted;
    const inserted = if (redo) d.record.inserted else d.record.removed;
    const bytes = try @import("plain_text_content.zig").textBytes(a, p);
    defer a.free(bytes);
    const start = try std.math.mul(usize, d.record.range.start, 2);
    const end = try std.math.add(usize, start, try std.math.mul(usize, removed.len, 2));
    if (end > bytes.len) return error.HistoryCurrentMismatch;
    for (removed, 0..) |v, i| if (std.mem.readInt(u16, bytes[start + i * 2 ..][0..2], .little) != v) return error.HistoryCurrentMismatch;
    const inserted_utf8 = try utf8(a, inserted);
    defer a.free(inserted_utf8);
    var draft = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer draft.deinit(a);
    try plain.apply(a, source, version, &draft, .{ .section = d.section, .paragraph = d.paragraph, .start_unit = @intCast(d.record.range.start), .end_unit = @intCast(d.record.range.start + removed.len), .utf8 = inserted_utf8 }, char_count);
    const runs = try a.dupe(model.CharacterRun, target.runs);
    a.free(draft.character_runs);
    draft.character_runs = runs;
    draft.declared_units = target.declared_units;
    draft.text_present = target.text_present;
    draft.deferred_direct_records = target.deferred;
    if (!target.range_present) {
        if (draft.range_tags) |rows| a.free(rows);
        draft.range_tags = null;
    } else if (draft.range_tags == null) draft.range_tags = try a.alloc(model.TextRange, 0);
    if (!target.matches(draft)) return error.HistoryCurrentMismatch;
    return draft;
}

// gap 적격성/source 정책은 Session이 검증하고 epoch로 수명을 닫는다.
pub fn prepareLive(live_a: std.mem.Allocator, storage: std.mem.Allocator, binding: epochs.Binding, backing: *@import("live_text_backing.zig").Backing, p: model.Paragraph, edit: plain.Splice, limit: usize, incarnation: u64, transaction_epoch: u64) !Prepared {
    if (edit.start_unit > edit.end_unit) return error.InvalidTextPosition;
    try backing.boundary(edit.start_unit);
    try backing.boundary(edit.end_unit);
    if (edit.utf8.len > 4 * 1024 * 1024) return error.LimitExceeded;
    var offset: usize = 0;
    while (try @import("../../text/scalars.zig").read(edit.utf8, offset, .utf8)) |c| {
        if (c.value < 32) return error.UnsupportedTextControl;
        offset = c.end;
    }
    const little = try std.unicode.utf8ToUtf16LeAlloc(live_a, edit.utf8);
    defer live_a.free(little);
    const add = try live_a.alloc(u16, little.len);
    defer live_a.free(add);
    for (little, add) |v, *out| {
        out.* = std.mem.littleToNative(u16, v);
        if (out.* < 32) return error.UnsupportedTextControl;
    }
    const removed = try backing.copyRange(live_a, edit.start_unit, edit.end_unit);
    defer live_a.free(removed);
    const count = backing.len() - removed.len + add.len;
    if (count * 2 > 8 * 1024 * 1024) return error.LimitExceeded;
    var record = try journal.Record.prepare(storage, binding, .{ .range = .{ .owner = binding.owner, .start = edit.start_unit }, .remove = removed, .insert = add }, limit);
    errdefer record.deinit();
    var draft = p; // 이 함수 내부에서만 메타데이터 계산에 사용. 토큰 borrow는 반환하지 않는다.
    draft.character_runs = try @import("character_runs.zig").replace(live_a, p.character_runs, edit.start_unit, edit.end_unit, @intCast(add.len), null);
    errdefer live_a.free(draft.character_runs);
    draft.range_tags = try live_a.alloc(model.TextRange, 0);
    errdefer live_a.free(draft.range_tags.?);
    draft.declared_units = @intCast(count);
    draft.deferred_direct_records = 0;
    var before = try Meta.capture(storage, p);
    errdefer before.deinit(storage);
    var after = try Meta.capture(storage, draft);
    errdefer after.deinit(storage);
    // forward와 역교환에 충분한 공간을 게시 전에 확보한다. payload는 독립 소유.
    try backing.reserve(add.len -| removed.len);
    backing.counters.run_rows_copied += p.character_runs.len + 2 * draft.character_runs.len;
    return .{ .allocator = live_a, .live = .{ .runs = draft.character_runs, .ranges = draft.range_tags, .declared_units = draft.declared_units, .deferred = draft.deferred_direct_records, .incarnation = incarnation, .expected_serial = backing.serial, .transaction_epoch = transaction_epoch }, .delta = .{ .allocator = storage, .section = edit.section, .paragraph = edit.paragraph, .record = record, .before = before, .after = after }, .before_cost = try liveCost(p), .after_cost = try liveCost(draft), .changed = !std.mem.eql(u16, removed, add) };
}
pub fn liveCost(p: model.Paragraph) !usize {
    // 적격 텍스트는 일반 text(선택)+CR이다. 빈 text 토큰을 만들어 비용을 부풀리지 않는다.
    return try std.math.add(usize, try std.math.add(usize, try std.math.mul(usize, if (p.declared_units > 1) @as(usize, 2) else 1, @sizeOf(model.Token)), try std.math.mul(usize, p.declared_units, 2)), try std.math.mul(usize, p.character_runs.len, @sizeOf(model.CharacterRun)));
}
