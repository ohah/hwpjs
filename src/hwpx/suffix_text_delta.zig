//! 단일 source text site의 suffix 교체. 일반 중간 편집은 기존 snapshot 경로로 남긴다.
const std = @import("std");
const editor = @import("editor_session.zig");
const sites_mod = @import("text_sites.zig");
const scalars = @import("../xml/scalars.zig");
pub const Lane = struct { section: usize, paragraph: usize, site: usize, element: usize, units: usize, bytes: usize };
pub const Delta = struct {
    section: usize,
    paragraph: usize,
    site: usize,
    element: usize,
    start_byte: usize,
    before_units: usize,
    after_units: usize,
    removed: []u8,
    inserted: []u8,
};
pub fn locate(s: *editor.Session, section: usize, paragraph: usize) !?Lane {
    if (section >= s.sections.len) return null;
    const row = &s.sections[section];
    if (row.structure_values != null or row.created_tables.entries.items.len != 0 or row.field_dirty.items.len != 0) return null;
    @import("plain_paragraph_policy.zig").validateWithTabs(&row.tree, &row.sites, row.locations, paragraph, true) catch |err| {
        if (err == error.OutOfMemory) return err;
        return null;
    };
    const positions = @import("paragraph_text_positions.zig").build(s.allocator, &row.tree, &row.sites, row.locations, paragraph) catch |err| {
        if (err == error.OutOfMemory) return err;
        return null;
    };
    defer s.allocator.free(positions);
    if (positions.len != 1 or positions[0].kind != .text or positions[0].start_unit != 0) return null;
    const index = positions[0].index;
    const site = row.sites.items[index];
    if (site.missing_text or site.empty_element or site.anchor_boundary) return null;
    return .{ .section = section, .paragraph = paragraph, .site = index, .element = site.element_index, .units = positions[0].end_unit, .bytes = site.text.len };
}
/// suffix만 뒤에서 읽어 surrogate 경계를 검사한다. 매 키 앞에서 전체 UTF-8을 재검색하지 않는다.
pub fn suffixStart(text: []const u8, deleted_units: usize) !usize {
    var offset = text.len;
    var units: usize = 0;
    while (units < deleted_units) {
        if (offset == 0) return error.InvalidTextPosition;
        var begin = offset - 1;
        while (begin > 0 and text[begin] & 0xc0 == 0x80) begin -= 1;
        const scalar = (try scalars.read(text[begin..offset], 0, .utf8)) orelse return error.InvalidTextPosition;
        const width: usize = if (scalar.value > 0xffff) 2 else 1;
        if (width > deleted_units - units) return error.SplitSurrogatePair;
        units += width;
        offset = begin;
    }
    return offset;
}
pub fn insertedUnits(text: []const u8) !usize {
    var offset: usize = 0;
    var count: usize = 0;
    while (try scalars.read(text, offset, .utf8)) |scalar| {
        if (!@import("../xml/characters.zig").valid(scalar.value)) return error.InvalidXmlCharacter;
        count = std.math.add(usize, count, if (scalar.value > 0xffff) 2 else 1) catch return error.LimitExceeded;
        offset = scalar.end;
    }
    return count;
}
/// 변경된 suffix bytes만 소유한다. 전체 payload 한도는 coordinator가 따로 검증한다.
pub fn prepare(a: std.mem.Allocator, s: *editor.Session, lane: Lane, deleted: usize, inserted: []const u8) !Delta {
    try s.sections[lane.section].sites.validateTextOwnership(lane.site);
    const site = &s.sections[lane.section].sites.items[lane.site];
    if (site.element_index != lane.element or site.text.len != lane.bytes) return error.HistoryCurrentMismatch;
    if (deleted > lane.units) return error.InvalidTextPosition;
    const begin = try suffixStart(site.text, deleted);
    const add_units = try insertedUnits(inserted);
    const after = std.math.add(usize, lane.units - deleted, add_units) catch return error.LimitExceeded;
    const removed = try a.dupe(u8, site.text[begin..]);
    errdefer a.free(removed);
    const added = try a.dupe(u8, inserted);
    return .{ .section = lane.section, .paragraph = lane.paragraph, .site = lane.site, .element = lane.element, .start_byte = begin, .before_units = lane.units, .after_units = after, .removed = removed, .inserted = added };
}
/// 전체 복사는 기하급수 확장 때만 수행한다. live view는 새 할당을 등록한 뒤 갱신한다.
pub fn reserve(s: *editor.Session, d: *const Delta, redo: bool) !void {
    const sites = &s.sections[d.section].sites;
    try sites.validateTextOwnership(d.site);
    const site = &sites.items[d.site];
    if (site.element_index != d.element) return error.SourceBindingMismatch;
    const needed = std.math.add(usize, d.start_byte, if (redo) d.inserted.len else d.removed.len) catch return error.LimitExceeded;
    const minimum = @max(needed, site.text.len);
    if (minimum > s.options.max_text_bytes) return error.LimitExceeded;
    if (sites.delta_buffers.get(d.site)) |buffer| if (buffer.len >= minimum) return;
    var capacity: usize = @min(s.options.max_text_bytes, @max(@as(usize, 32), site.text.len));
    while (capacity < minimum) capacity = @min(s.options.max_text_bytes, std.math.mul(usize, capacity, 2) catch s.options.max_text_bytes);
    const next = try s.allocator.alloc(u8, capacity);
    errdefer s.allocator.free(next);
    @memcpy(next[0..site.text.len], site.text);
    try sites.delta_buffers.ensureUnusedCapacity(s.allocator, 1);
    const old = sites.delta_buffers.get(d.site) orelse site.text;
    sites.delta_buffers.putAssumeCapacity(d.site, next);
    site.text = next[0..site.text.len];
    s.allocator.free(old);
}
pub fn validate(s: *editor.Session, d: *const Delta, redo: bool) !void {
    if (d.section >= s.sections.len or d.site >= s.sections[d.section].sites.items.len) return error.SourceBindingMismatch;
    try s.sections[d.section].sites.validateTextOwnership(d.site);
    const site = s.sections[d.section].sites.items[d.site];
    const expected = if (redo) d.removed else d.inserted;
    if (site.element_index != d.element or site.text.len != d.start_byte + expected.len) return error.HistoryCurrentMismatch;
    if (!std.mem.eql(u8, site.text[d.start_byte..], expected)) return error.HistoryCurrentMismatch;
}
/// reserve/validate 뒤 할당 없는 적용·역연산. source XML/원본 bytes를 변경하지 않는다.
pub fn commit(s: *editor.Session, d: *const Delta, redo: bool) void {
    const sites = &s.sections[d.section].sites;
    const text = if (redo) d.inserted else d.removed;
    const buffer = sites.delta_buffers.get(d.site).?;
    @memcpy(buffer[d.start_byte..][0..text.len], text);
    sites.items[d.site].text = buffer[0 .. d.start_byte + text.len];
}
/// 모든 clone 준비 후에만 교환한다. 실패하면 live text와 backing 모두 불변이다.
pub fn normalize(s: *editor.Session) !void {
    const Row = struct { section: usize, sites: sites_mod.Sites };
    var pending: std.ArrayList(Row) = .empty;
    defer {
        for (pending.items) |*row| row.sites.deinit(s.allocator);
        pending.deinit(s.allocator);
    }
    for (s.sections, 0..) |*section, index| {
        if (section.sites.delta_buffers.count() == 0) continue;
        try pending.ensureUnusedCapacity(s.allocator, 1);
        var copy = try section.sites.clone(s.allocator);
        copy.delta_watch = section.sites.delta_watch;
        pending.appendAssumeCapacity(.{ .section = index, .sites = copy });
    }
    for (pending.items) |*row| std.mem.swap(sites_mod.Sites, &row.sites, &s.sections[row.section].sites);
}
