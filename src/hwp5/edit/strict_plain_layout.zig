//! Trusted-host measured layout boundary, NOT authentication of browser metrics.
//! Native validates current source, complete coverage and geometry. The browser
//! producer owns actual font measurement; no caller boolean certifies it.
const std = @import("std");
const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
const Header = @import("../body/paragraph_header.zig").Header;
const Runs = @import("../body/char_runs.zig").Runs;
const CharShape = @import("../docinfo/reader.zig").CharShape;
const codec = @import("../body/line_segment_writer.zig");
const patch = @import("line_layout_patch.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
pub const Line = struct { paragraph: u32, segment: codec.Segment };
pub const Paragraph = struct { ordinal: usize, raw: []const u16, font: []const u8, size: i32, bold: bool, italic: bool, spacing_percent: i32 };
pub const Wire = struct { schema: u32 = 1, version: u32, width: i32, height: i32, paragraphs: []const Paragraph };
/// Retained by every snapshot. A closed Session can never be revived by pointer reuse.
/// Session and its snapshots are confined to the same serialized owner thread.
pub const Lease = struct {
    allocator: std.mem.Allocator,
    references: usize = 1,
    closed: bool = false,
    pub fn create(a: std.mem.Allocator) !*Lease {
        const p = try a.create(Lease);
        p.* = .{ .allocator = a };
        return p;
    }
    pub fn retain(self: *Lease) !void {
        if (self.closed) return error.SessionClosed;
        self.references = try std.math.add(usize, self.references, 1);
    }
    pub fn release(self: *Lease) void {
        self.references -= 1;
        if (self.references == 0) self.allocator.destroy(self);
    }
    pub fn close(self: *Lease) void {
        self.closed = true;
        self.release();
    }
};
pub const Snapshot = struct {
    lease: *Lease,
    arena: std.heap.ArenaAllocator,
    owner: usize,
    serial: u64,
    ticket: epoch.Ticket,
    draft: []const u8,
    docinfo: []const u8,
    wire: Wire,
    pub fn deinit(self: *Snapshot) void {
        self.arena.deinit();
        self.lease.release();
        self.* = undefined;
    }
};
pub const Request = struct { snapshot: *const Snapshot, lines: []const Line };
const limit = 32 * 1024 * 1024;

pub fn prepare(a: std.mem.Allocator, draft: []const u8, docinfo: []const u8, version: Version, owner: usize, serial: u64, ticket: epoch.Ticket, lease: *Lease) !Snapshot {
    if (version.raw < 0x05000107 or version.raw >= 0x05010000) return error.UnsupportedLayoutWriteVersion;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const scratch = arena.allocator();
    const bytes = try scratch.dupe(u8, draft);
    const info = @import("../docinfo/reader.zig");
    var chars: std.ArrayList(info.CharShape) = .empty;
    var paras: std.ArrayList(info.ParaShape) = .empty;
    var di = try info.Iterator.init(docinfo, version, .{});
    while (try di.next()) |r| switch (r.value) {
        .char_shape => |v| try chars.append(scratch, v),
        .para_shape => |v| try paras.append(scratch, v),
        else => {},
    };
    const fonts = try @import("font_face_snapshot.zig").read(scratch, docinfo, version, 100000, 4096);
    // Resolve language partitions once, never rescan all fonts per paragraph.
    var names: std.AutoHashMapUnmanaged(u64, []const u8) = .empty;
    for (fonts) |f| if (f.name) |name| try names.put(scratch, (@as(u64, @backingInt(f.language)) << 32) | f.id, name);
    const page = try @import("page_settings_snapshot.zig").read(scratch, bytes, version);
    if (page.flags != 0 or page.gutter != 0 or page.extra_bytes != 0) return error.UnsupportedStrictPage;
    const horizontal = @as(u64, page.left) + page.right;
    const vertical = @as(u64, page.top) + page.bottom + page.header + page.footer;
    if (page.width <= horizontal or page.height <= vertical) return error.UnsupportedStrictPage;
    const width = std.math.cast(i32, page.width - horizontal) orelse return error.LayoutLimitExceeded;
    const height = std.math.cast(i32, page.height - vertical) orelse return error.LayoutLimitExceeded;
    const section = try @import("section_settings_snapshot.zig").read(scratch, bytes, version);
    if (section.flags != 0 or section.vertical_grid != 0 or section.horizontal_grid != 0 or section.extra_nonzero or section.memo_list_count != 0) return error.UnsupportedStrictSection;
    const columns = try @import("column_sources_snapshot.zig").read(scratch, bytes, version);
    if (columns.len != 1 or columns[0].count != 1 or columns[0].kind != 0 or columns[0].direction != 0 or columns[0].extra_bytes != 0) return error.UnsupportedStrictColumns;
    var it = framing.Iterator.init(bytes, .{ .max_payload_bytes = limit });
    var rows: std.ArrayList(Paragraph) = .empty;
    var header: ?Header = null;
    var ordinal: usize = 0;
    var header_ordinal: usize = 0;
    var raw: ?[]const u8 = null;
    var character_runs: ?Runs = null;
    var all_units: usize = 0;
    while (try it.next()) |r| : (ordinal += 1) {
        if (r.tag == 66) {
            if (r.level != 0) return error.UnsupportedStrictBody;
            if (header) |h| try appendParagraph(scratch, &rows, h, header_ordinal, raw, character_runs, chars.items, paras.items, &names, &all_units);
            header = try Header.parse(r.payload, version);
            if (header.?.break_flags != 0 or header.?.range_tag_count != 0 or header.?.char_shape_count == 0 or header.?.extra.len != 0) return error.UnsupportedStrictBody;
            header_ordinal = ordinal;
            raw = null;
            character_runs = null;
        } else switch (r.tag) {
            67 => {
                if (header == null or r.level != 1 or raw != null) return error.UnsupportedStrictBody;
                raw = r.payload;
            },
            68 => {
                if (header == null or r.level != 1 or character_runs != null) return error.UnsupportedStrictBody;
                character_runs = try Runs.parse(r.payload);
            },
            69 => {
                if (r.level != 1) return error.UnsupportedStrictBody;
            },
            71 => {
                if (rows.items.len != 0 or r.level != 1 or r.payload.len < 4) return error.UnsupportedStrictBody;
                const id = std.mem.readInt(u32, r.payload[0..4], .little);
                if (id != 0x73656364 and id != 0x636f6c64) return error.UnsupportedStrictBody;
            },
            // Actual section-owned typed page/note-shape/border definitions only.
            73, 74, 75 => {
                if (rows.items.len != 0 or r.level != 2) return error.UnsupportedStrictBody;
            },
            else => return error.UnsupportedStrictBody,
        }
    }
    if (header) |h| try appendParagraph(scratch, &rows, h, header_ordinal, raw, character_runs, chars.items, paras.items, &names, &all_units);
    if (rows.items.len == 0) return error.UnsupportedStrictBody;
    const info_copy = try scratch.dupe(u8, docinfo);
    const wire_rows = try rows.toOwnedSlice(scratch);
    try lease.retain();
    return .{ .lease = lease, .arena = arena, .owner = owner, .serial = serial, .ticket = ticket, .draft = bytes, .docinfo = info_copy, .wire = .{ .version = version.raw, .width = width, .height = height, .paragraphs = wire_rows } };
}
fn appendParagraph(a: std.mem.Allocator, rows: *std.ArrayList(Paragraph), h: Header, ordinal: usize, text: ?[]const u8, character_runs: ?Runs, chars: []const CharShape, paras: []const @import("../docinfo/reader.zig").ParaShape, names: *const std.AutoHashMapUnmanaged(u64, []const u8), total: *usize) !void {
    const raw = text orelse return error.UnsupportedStrictBody;
    if (raw.len % 2 != 0 or raw.len < 2 or raw.len / 2 != h.characterUnits() or h.para_shape_id >= paras.len) return error.UnsupportedStrictBody;
    total.* = try std.math.add(usize, total.*, raw.len / 2);
    if (total.* > 4 * 1024 * 1024 or rows.items.len >= 65535) return error.LayoutLimitExceeded;
    const units = try a.alloc(u16, raw.len / 2);
    for (units, 0..) |*u, i| u.* = std.mem.readInt(u16, raw[i * 2 ..][0..2], .little);
    // Prefix controls are permitted only in the first top-level paragraph.
    var start: usize = 0;
    if (units[0] == 2) {
        if (rows.items.len != 0 or units.len < 17) return error.UnsupportedStrictBody;
        inline for (.{ @as(u32, 0x73656364), @as(u32, 0x636f6c64) }, 0..) |control, i| {
            const at = i * 8;
            if (units[at] != 2 or units[at + 7] != 2 or std.mem.readInt(u32, raw[(at + 1) * 2 ..][0..4], .little) != control) return error.UnsupportedStrictBody;
        }
        start = 16;
    }
    var expected_mask: u32 = (1 << 13) | (if (start == 16) @as(u32, 4) else 0);
    for (units[start .. units.len - 1]) |u| if (u == 10) {
        expected_mask |= 1 << 10;
    };
    if (h.control_mask != expected_mask or (h.merge_tracking orelse 0) != 0) return error.UnsupportedStrictBody;
    if (units[units.len - 1] != 13) return error.UnsupportedStrictBody;
    for (units[start .. units.len - 1]) |u| if (!(u == 10 or (u >= 32 and u <= 126) or (u >= 0xac00 and u <= 0xd7a3))) return error.UnsupportedStrictScript;
    const runs = character_runs orelse return error.UnsupportedStrictBody;
    const char_id = try measuredStyle(units, start, runs, h.char_shape_count, chars);
    const c = chars[char_id];
    const p = paras[h.para_shape_id];
    // Exact left alignment, percent spacing, no grid/keep/tab/heading/borders.
    if ((p.attributes & ~@as(u32, 1 << 7)) != 4 or (p.attributes2 orelse 0) != 0 or p.left != 0 or p.right != 0 or p.indent != 0 or p.before != 0 or p.after != 0 or p.head_id != 0 or p.tab_def_id != 0 or p.border_fill_id != 0 or !std.mem.allEqual(i16, &p.border_spacing, 0) or p.extra.len != 0) return error.UnsupportedStrictParagraphStyle;
    const spacing = if (p.modern_spacing) |modern| blk: {
        if (modern.attributes != 0) return error.UnsupportedStrictParagraphStyle;
        break :blk modern.value;
    } else p.legacy_spacing;
    if (spacing < 100 or spacing > 1000 or c.size <= 0 or c.size > 72000 or c.attributes & ~@as(u32, 3) != 0 or (c.border_fill_id orelse 0) != 0 or c.extra.len != 0 or c.unresolved_tail != null) return error.UnsupportedStrictCharacterStyle;
    for (0..7) |i| if (c.ratios[i] != 100 or c.relative_sizes[i] != 100 or c.spacing[i] != 0 or c.offsets[i] != 0) return error.UnsupportedStrictCharacterStyle;
    for (0..runs.count()) |index| {
        const used = chars[runs.get(index).?.char_shape_id];
        for (0..7) |language| {
            if (!names.contains((@as(u64, language) << 32) | used.font_ids[language])) return error.MissingStrictFont;
        }
    }
    const hangul = names.get(c.font_ids[0]) orelse return error.MissingStrictFont;
    const latin = names.get((@as(u64, 1) << 32) | c.font_ids[1]) orelse return error.MissingStrictFont;
    if (hangul.len == 0 or !std.mem.eql(u8, hangul, latin)) return error.UnsupportedStrictFont;
    try rows.append(a, .{ .ordinal = ordinal, .raw = units, .font = hangul, .size = c.size, .bold = c.attributes & 2 != 0, .italic = c.attributes & 1 != 0, .spacing_percent = spacing });
}

/// Resolve measurement ownership from visible text, never from prefix run zero.
/// Wire runs remain borrowed/unchanged. Two forward text passes and bounded
/// per-run checks are O(raw units + run count); no resource scan per character.
fn measuredStyle(units: []const u16, start: usize, runs: Runs, declared: u16, chars: []const CharShape) !u32 {
    if (runs.count() == 0 or runs.count() != declared) return error.UnsupportedStrictBody;
    var previous: u32 = 0;
    for (0..runs.count()) |index| {
        const row = runs.get(index).?;
        if (row.char_shape_id >= chars.len or row.start >= units.len or
            (index == 0 and row.start != 0) or (index > 0 and row.start <= previous)) return error.UnsupportedStrictBody;
        // A style boundary may surround an intact structural token, never split it.
        if (row.start < start and row.start != 0 and row.start != 8) return error.UnsupportedStrictBody;
        previous = row.start;
    }
    var cursor: usize = 0;
    var selected: ?u32 = null;
    for (start..units.len - 1) |at| {
        while (cursor + 1 < runs.count() and runs.get(cursor + 1).?.start <= at) : (cursor += 1) {}
        if (units[at] == 10) continue;
        const id = runs.get(cursor).?.char_shape_id;
        if (selected) |old| {
            if (old != id) return error.UnsupportedStrictMixedVisibleStyle;
        } else selected = id;
    }
    if (selected == null) {
        cursor = 0;
        while (cursor + 1 < runs.count() and runs.get(cursor + 1).?.start <= start) : (cursor += 1) {}
        selected = runs.get(cursor).?.char_shape_id;
    }
    const id = selected.?;
    cursor = 0;
    var visible = false;
    for (start..units.len) |at| {
        while (cursor + 1 < runs.count() and runs.get(cursor + 1).?.start <= at) : (cursor += 1) {}
        if (units[at] == 10 or at == units.len - 1) {
            // Empty-line 'M' measurements must use that line's actual marker style.
            if (!visible and runs.get(cursor).?.char_shape_id != id) return error.UnsupportedStrictEmptyLineStyle;
            visible = false;
        } else visible = true;
    }
    const c = chars[id];
    for (0..runs.count()) |index| {
        const hidden = chars[runs.get(index).?.char_shape_id];
        if (hidden.size != c.size or hidden.attributes != c.attributes or
            (hidden.border_fill_id orelse 0) != 0 or hidden.extra.len != 0 or hidden.unresolved_tail != null) return error.UnsupportedStrictHiddenStyle;
        for (0..7) |language| {
            if (hidden.ratios[language] != 100 or hidden.relative_sizes[language] != 100 or
                hidden.spacing[language] != 0 or hidden.offsets[language] != 0) return error.UnsupportedStrictHiddenStyle;
        }
    }
    return id;
}

/// No state mutation. Complete coverage is mandatory, including unchanged peers.
pub fn apply(a: std.mem.Allocator, request: Request, current: []const u8, version: Version, output_limit: usize) ![]u8 {
    const s = request.snapshot;
    if (s.lease.closed) return error.SessionClosed;
    if (!std.mem.eql(u8, s.draft, current) or s.wire.version != version.raw) return error.LayoutSourceChanged;
    if (request.lines.len == 0 or request.lines.len > 262144) return error.LayoutLimitExceeded;
    const patches = try a.alloc(patch.Patch, s.wire.paragraphs.len);
    defer a.free(patches);
    const segments = try a.alloc(codec.Segment, request.lines.len);
    defer a.free(segments);
    const texts = try a.alloc([]u8, patches.len);
    defer a.free(texts);
    var text_count: usize = 0;
    defer for (texts[0..text_count]) |text| a.free(text);
    var at: usize = 0;
    var y: i64 = 0;
    for (s.wire.paragraphs, 0..) |p, pi| {
        const first = at;
        var expected_start: u32 = 0;
        var raw_index: usize = if (p.raw[0] == 2) 16 else 0;
        while (true) {
            if (at >= request.lines.len or request.lines[at].paragraph != pi) return error.IncompleteStrictLayout;
            const line = request.lines[at].segment;
            var end = raw_index;
            while (end < p.raw.len - 1 and p.raw[end] != 10) : (end += 1) {}
            const hard_break = end < p.raw.len - 1;
            const empty = end == raw_index;
            const expected_flags: u32 = codec.line_ends | (if (at == 0) @as(u32, 3) else 0) | (if (empty) @as(u32, 1 << 16) else 0);
            const advance = @divTrunc(@as(i64, p.size) * p.spacing_percent + 50, 100);
            if (line.start != expected_start or line.y != y or line.x != 0 or line.width != s.wire.width or line.flags != expected_flags or line.height <= 0 or line.height > advance or line.text_height != p.size or line.baseline < 0 or line.baseline > line.height or @as(i64, line.height) + line.spacing != advance) return error.InvalidStrictLayout;
            if (y + advance > s.wire.height) return error.StrictLayoutPageOverflow;
            y += advance;
            segments[at] = line;
            at += 1;
            if (!hard_break) break;
            raw_index = end + 1;
            expected_start = @intCast(raw_index);
        }
        const raw_bytes = try a.alloc(u8, p.raw.len * 2);
        // Scratch allocator is typically an arena; also release in general use.
        texts[text_count] = raw_bytes;
        text_count += 1;
        for (p.raw, 0..) |u, i| std.mem.writeInt(u16, raw_bytes[i * 2 ..][0..2], u, .little);
        patches[pi] = .{ .header_ordinal = p.ordinal, .expected_text = raw_bytes, .segments = segments[first..at] };
    }
    if (at != request.lines.len) return error.IncompleteStrictLayout;
    const prepared = try patch.prepare(a, current, version, patches, output_limit);
    return prepared.bytes;
}

test "strict save integration visible style resolver keeps empty line and run boundary guards" {
    var payload: [74]u8 = @splat(0);
    @memset(payload[14..21], 100);
    @memset(payload[28..35], 100);
    std.mem.writeInt(i32, payload[42..46], 1100, .little);
    const first = try CharShape.parse(&payload, .{ .raw = 0x05000300 });
    var shapes = [_]CharShape{ first, first };
    shapes[1].font_ids = @splat(1);
    const nonempty = [_]u16{ 'A', 13 };
    const empty_last = [_]u16{ 'A', 10, 13 };
    const wire = [_]u8{ 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0 };
    const marker = try Runs.parse(&wire);
    try std.testing.expectEqual(@as(u32, 1), try measuredStyle(&nonempty, 0, marker, 2, &shapes));
    var empty_wire = wire;
    empty_wire[8] = 2;
    try std.testing.expectError(error.UnsupportedStrictEmptyLineStyle, measuredStyle(&empty_last, 0, try Runs.parse(&empty_wire), 2, &shapes));
    try std.testing.expectError(error.UnsupportedStrictBody, measuredStyle(&nonempty, 0, marker, 1, &shapes));
    var bad = wire;
    bad[8] = 0;
    try std.testing.expectError(error.UnsupportedStrictBody, measuredStyle(&nonempty, 0, try Runs.parse(&bad), 2, &shapes));
    bad = wire;
    bad[12] = 2;
    try std.testing.expectError(error.UnsupportedStrictBody, measuredStyle(&nonempty, 0, try Runs.parse(&bad), 2, &shapes));
    // The general edit model permits an affinity sentinel at raw EOF. This
    // strict writer needs no sentinel for the observed 0/16/20 ranges; reject
    // it rather than claim that it is an occupied source style span.
    bad = wire;
    bad[8] = 2;
    try std.testing.expectError(error.UnsupportedStrictBody, measuredStyle(&nonempty, 0, try Runs.parse(&bad), 2, &shapes));
    const no_text = [_]u16{13};
    const one = try Runs.parse(wire[0..8]);
    try std.testing.expectEqual(@as(u32, 1), try measuredStyle(&no_text, 0, one, 1, &shapes));
}
