//! Bulk string draft only. Caller owns source permission, Tree/control identity,
//! paragraph/style/field/meta updates and History. Original coordinates throughout.
const std = @import("std");
const model = @import("../model/independent_text_edits.zig");
const Sites = @import("text_sites.zig").Sites;
const Site = @import("text_sites.zig").Site;
const Segment = @import("paragraph_text_positions.zig").Segment;
const scalars = @import("../xml/scalars.zig");
const characters = @import("../xml/characters.zig");
pub const Options = struct {
    max_bytes: usize,
    limits: model.Limits = .{},
    /// Null entries use existing spliceProjected left affinity. Caller supplies
    /// per-edit replacement/field/header/footer affinity on the ORIGINAL axis.
    insertion_sites: ?[]const ?usize = null,
    /// Internal Native contract only. Generic callers and all single splices
    /// retain legacy left affinity; the independent Session explicitly opts in.
    replacement_inheritance: enum { legacy_left, first_replaced } = .legacy_left,
};
const none = std.math.maxInt(usize);
const State = struct {
    segment: ?usize = null,
    units: usize = 0,
    unit_cursor: usize = 0,
    byte_cursor: usize = 0,
    head: usize = none,
    tail: usize = none,
    replacement: ?[]u8 = null,
    original: ?Site = null,
    backing: ?[]u8 = null,
    source_offset: usize = 0,
    boundary_offset: usize = 0,
};
const Fragment = struct { site: usize, start: usize, end: usize, unit_start: usize, unit_end: usize };
pub const Change = struct { start: usize, end: usize, text: []const u8, next: usize = none, unit_start: usize, unit_end: usize, inserted_units: usize, inherit_first_replaced: bool = false };
const Cut = Change;
const Work = struct {
    site_checks: usize = 0,
    source_bytes: usize = 0,
    segments: usize = 0,
    edit_visits: usize = 0,
    boundary_visits: usize = 0,
    cursor_bytes: usize = 0,
    comparison_bytes: usize = 0,
    cut_visits: usize = 0,
    output_bytes: usize = 0,
    buffers: usize = 0,
    receipt_bytes: usize = 0,
    scalar_index_reads: usize = 0,
};
fn tick(comptime measured: bool, work: if (measured) *Work else void, comptime field: []const u8, amount: usize) void {
    if (measured) @field(work, field) += amount;
}
const Matcher = struct {
    wanted: []const u8,
    offset: usize = 0,
    equal: bool = true,
    fn feed(self: *Matcher, bytes: []const u8) void {
        const available = self.wanted.len -| self.offset;
        if (bytes.len > available or !std.mem.eql(u8, self.wanted[@min(self.offset, self.wanted.len)..][0..@min(bytes.len, available)], bytes[0..@min(bytes.len, available)])) self.equal = false;
        self.offset += bytes.len;
    }
    fn matches(self: Matcher) bool {
        return self.equal and self.offset == self.wanted.len;
    }
};
fn byteAt(comptime measured: bool, work: if (measured) *Work else void, state: *State, text: []const u8, wanted: usize) !usize {
    if (wanted < state.unit_cursor) return error.InvalidTextSites;
    while (state.unit_cursor < wanted) {
        const scalar = (try scalars.read(text, state.byte_cursor, .utf8)) orelse return error.InvalidTextPosition;
        const width: usize = if (scalar.value > 0xffff) 2 else 1;
        if (wanted - state.unit_cursor < width) return error.SplitSurrogatePair;
        tick(measured, work, "cursor_bytes", scalar.end - state.byte_cursor);
        state.unit_cursor += width;
        state.byte_cursor = scalar.end;
    }
    return state.byte_cursor;
}
fn appendCut(a: std.mem.Allocator, cuts: *std.ArrayList(Cut), state: *State, value: Cut) !void {
    if (state.tail != none and value.start < cuts.items[state.tail].end) return error.InvalidTextSites;
    const index = cuts.items.len;
    try cuts.append(a, value);
    if (state.tail != none) cuts.items[state.tail].next = index else state.head = index;
    state.tail = index;
}

pub const EffectiveEdit = struct {
    start: u32,
    end: u32,
    changed: bool = false,
    insertion_site: ?usize = null,
    inserted_units: u32 = 0,
    inserted_start: u32 = 0,
    inserted_end: u32 = 0,
};
/// Owned request draft. Copies/positions/receipts never grant source permission.
/// Original Sites and optional watcher must outlive validate/commit.
pub const Prepared = struct {
    allocator: std.mem.Allocator,
    source: *const Sites,
    items_pointer: [*]Site,
    backing_map: @TypeOf(@as(Sites, undefined).delta_buffers.storage),
    backing_count: u32,
    watch: @TypeOf(@as(Sites, undefined).delta_watch),
    serial: u64,
    active: bool,
    states: []State,
    source_copy: []u8,
    boundaries: []bool,
    positions: []Segment,
    edits: []EffectiveEdit,
    changes: []Change,
    changed: bool,
    consumed: bool = false,
    pub fn deinit(self: *Prepared) void {
        for (self.states) |state| if (state.replacement) |bytes| self.allocator.free(bytes);
        self.allocator.free(self.states);
        self.allocator.free(self.source_copy);
        self.allocator.free(self.boundaries);
        self.allocator.free(self.positions);
        self.allocator.free(self.edits);
        self.allocator.free(self.changes);
        self.* = undefined;
    }
    pub fn sourceText(self: *const Prepared, site: usize) []const u8 {
        const state = self.states[site];
        return self.source_copy[state.source_offset..][0..state.original.?.text.len];
    }
    /// Read-only prepared view for caller-owned metadata preparation. Expires
    /// at commit/deinit; no Sites ownership or mutation authority is transferred.
    pub fn outputText(self: *const Prepared, site: usize) []const u8 {
        return self.states[site].replacement orelse self.sourceText(site);
    }
    pub fn scalarBoundary(self: *const Prepared, site: usize, unit: usize) bool {
        if (site >= self.states.len or unit > self.states[site].units) return false;
        return self.boundaries[self.states[site].boundary_offset + unit];
    }
    pub fn firstChange(self: *const Prepared, site: usize) ?usize {
        const head = self.states[site].head;
        return if (head == none) null else head;
    }
    pub fn nextChange(self: *const Prepared, index: usize) ?usize {
        const next = self.changes[index].next;
        return if (next == none) null else next;
    }
    pub fn validate(self: *const Prepared, sites: *const Sites) !void {
        if (self.consumed or sites != self.source or sites.items.ptr != self.items_pointer or sites.items.len != self.states.len or sites.delta_buffers.storage != self.backing_map or sites.delta_buffers.count() != self.backing_count) return error.StaleTextDraft;
        if (!std.meta.eql(sites.delta_watch, self.watch)) return error.StaleTextDraft;
        if (self.watch) |watch| if (watch.serial.* != self.serial or watch.active.* != self.active) return error.StaleTextDraft;
        for (sites.items, self.states, 0..) |now, state, index| {
            const old = state.original.?;
            if (now.text.ptr != old.text.ptr or now.text.len != old.text.len or now.element_index != old.element_index or now.start != old.start or now.end != old.end or now.empty_element != old.empty_element or now.missing_text != old.missing_text or now.anchor_boundary != old.anchor_boundary) return error.StaleTextDraft;
            const backing = sites.delta_buffers.get(index);
            if ((backing == null) != (state.backing == null)) return error.StaleTextDraft;
            if (backing) |bytes| if (bytes.ptr != state.backing.?.ptr or bytes.len != state.backing.?.len) return error.StaleTextDraft;
            try sites.validateTextOwnership(index);
            if (!std.mem.eql(u8, now.text, self.sourceText(index))) return error.StaleTextDraft;
        }
    }
    /// Validate everything before release; the installation phase cannot fail.
    pub fn commit(self: *Prepared, sites: *Sites) !bool {
        try self.validate(sites);
        for (self.states, 0..) |state, index| if (state.replacement != null) try sites.prepareTextCommit(index);
        for (self.states, 0..) |*state, index| if (state.replacement) |bytes| {
            sites.releaseText(self.allocator, index);
            sites.items[index].text = bytes;
            state.replacement = null;
        };
        if (self.changed) sites.finishTextCommit();
        self.consumed = true;
        return self.changed;
    }
};
pub fn prepare(a: std.mem.Allocator, sites: *Sites, positions: []const Segment, edits: []const model.Edit, options: Options) !Prepared {
    return run(false, {}, a, sites, positions, edits, options);
}

pub fn apply(a: std.mem.Allocator, sites: *Sites, positions: []const Segment, edits: []const model.Edit, options: Options) !bool {
    var draft = try prepare(a, sites, positions, edits, options);
    defer draft.deinit();
    return draft.commit(sites);
}
// Entire measuring specialization/namespace is absent in non-test builds.
pub const testing = if (@import("builtin").is_test) struct {
    pub const Counters = Work;
    pub fn applyMeasured(a: std.mem.Allocator, sites: *Sites, positions: []const Segment, edits: []const model.Edit, options: Options, work: *Counters) !bool {
        var draft = try run(true, work, a, sites, positions, edits, options);
        defer draft.deinit();
        return draft.commit(sites);
    }
} else struct {};

fn run(comptime measured: bool, work: if (measured) *Work else void, a: std.mem.Allocator, sites: *Sites, positions: []const Segment, edits: []const model.Edit, options: Options) !Prepared {
    if (positions.len == 0) return error.InvalidTextPosition;
    const before_units = std.math.cast(u32, positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    _ = try model.validate(edits, before_units, options.limits);
    if (options.insertion_sites) |affinity| if (affinity.len != edits.len) return error.InvalidInsertionSite;
    const states = try a.alloc(State, sites.items.len);
    errdefer a.free(states);
    @memset(states, .{});
    errdefer for (states) |state| if (state.replacement) |buffer| a.free(buffer);
    var total_bytes: usize = 0;
    for (sites.items, states, 0..) |site, *state, index| {
        tick(measured, work, "site_checks", 1);
        try sites.validateTextOwnership(index);
        total_bytes = std.math.add(usize, total_bytes, site.text.len) catch return error.LimitExceeded;
        var offset: usize = 0;
        while (try scalars.read(site.text, offset, .utf8)) |scalar| {
            if (!characters.valid(scalar.value)) return error.InvalidXmlCharacter;
            state.units = std.math.add(usize, state.units, if (scalar.value > 0xffff) 2 else 1) catch return error.LimitExceeded;
            tick(measured, work, "source_bytes", scalar.end - offset);
            offset = scalar.end;
        }
    }
    const source_copy = try a.alloc(u8, total_bytes);
    errdefer a.free(source_copy);
    var source_offset: usize = 0;
    var boundary_count: usize = 0;
    for (sites.items, states, 0..) |site, *state, index| {
        state.original = site;
        state.backing = sites.delta_buffers.get(index);
        state.source_offset = source_offset;
        state.boundary_offset = boundary_count;
        @memcpy(source_copy[source_offset..][0..site.text.len], site.text);
        source_offset += site.text.len;
        tick(measured, work, "receipt_bytes", site.text.len);
        boundary_count = std.math.add(usize, boundary_count, std.math.add(usize, state.units, 1) catch return error.LimitExceeded) catch return error.LimitExceeded;
    }
    const boundaries = try a.alloc(bool, boundary_count);
    errdefer a.free(boundaries);
    @memset(boundaries, false);
    for (sites.items, states) |site, state| {
        var byte: usize = 0;
        var unit: usize = state.boundary_offset;
        boundaries[unit] = true;
        while (try scalars.read(site.text, byte, .utf8)) |scalar| {
            unit += if (scalar.value > 0xffff) @as(usize, 2) else 1;
            boundaries[unit] = true;
            tick(measured, work, "scalar_index_reads", 1);
            byte = scalar.end;
        }
    }
    const owned_positions = try a.dupe(Segment, positions);
    errdefer a.free(owned_positions);
    const effective = try a.alloc(EffectiveEdit, edits.len);
    errdefer a.free(effective);
    var deleted_units: u32 = 0;
    var added_units: u32 = 0;
    var axis: usize = 0;
    for (positions, 0..) |position, ordinal| {
        tick(measured, work, "segments", 1);
        if (position.start_unit != axis or position.end_unit < axis) return error.InvalidTextSites;
        if (position.kind == .text) {
            if (position.index >= states.len) return error.InvalidTextSites;
            const state = &states[position.index];
            if (state.segment != null or position.source_start != sites.items[position.index].start) return error.SourceBindingMismatch;
            if (position.end_unit - axis != state.units) return error.SourceBindingMismatch;
            state.segment = ordinal;
        } else if (position.end_unit - axis != 1) return error.InvalidTextSites;
        axis = position.end_unit;
    }
    var cuts: std.ArrayList(Cut) = .empty;
    errdefer cuts.deinit(a);
    var fragments: std.ArrayList(Fragment) = .empty;
    defer fragments.deinit(a);
    var boundary_cursor: usize = 0;
    var delete_cursor: usize = 0;
    var changed = false;
    for (edits, 0..) |item, edit_index| {
        tick(measured, work, "edit_visits", 1);
        // Replacement XML-character policy is separate from shared Unicode/shape.
        var offset: usize = 0;
        while (try scalars.read(item.text, offset, .utf8)) |scalar| {
            if (!characters.valid(scalar.value)) return error.InvalidXmlCharacter;
            offset = scalar.end;
        }
        while (boundary_cursor < positions.len and positions[boundary_cursor].end_unit < item.start) : (boundary_cursor += 1) tick(measured, work, "boundary_visits", 1);
        const explicit_site = if (options.insertion_sites) |affinity| affinity[edit_index] else null;
        var target: ?usize = explicit_site;
        if (target) |index| {
            if (index >= states.len) return error.InvalidInsertionSite;
            const ordinal = states[index].segment orelse return error.InvalidInsertionSite;
            const position = positions[ordinal];
            if (item.start < position.start_unit or item.start > position.end_unit) return error.InvalidInsertionSite;
        } else {
            var candidate = boundary_cursor;
            var fallback: ?usize = null;
            while (candidate < positions.len and positions[candidate].start_unit <= item.start) : (candidate += 1) {
                tick(measured, work, "boundary_visits", 1);
                const position = positions[candidate];
                if (position.kind != .text or position.end_unit < item.start) continue;
                if (!sites.items[position.index].anchor_boundary) {
                    target = position.index;
                    break;
                }
                if (fallback == null) fallback = position.index;
            }
            target = target orelse fallback;
        }
        var insert_byte = if (target) |index| try byteAt(measured, work, &states[index], sites.items[index].text, item.start - positions[states[index].segment.?].start_unit) else 0;
        fragments.clearRetainingCapacity();
        var same: Matcher = .{ .wanted = item.text };
        var expected: Matcher = .{ .wanted = item.expected orelse "" };
        while (delete_cursor < positions.len and positions[delete_cursor].end_unit <= item.start) : (delete_cursor += 1) tick(measured, work, "segments", 1);
        var cursor = delete_cursor;
        while (cursor < positions.len and positions[cursor].start_unit < item.end) : (cursor += 1) {
            tick(measured, work, "segments", 1);
            const position = positions[cursor];
            const low = @max(@as(usize, item.start), position.start_unit);
            const high = @min(@as(usize, item.end), position.end_unit);
            if (high <= low) continue;
            if (position.kind != .text) return error.ProtectedInlineControl;
            const index = position.index;
            const start = try byteAt(measured, work, &states[index], sites.items[index].text, low - position.start_unit);
            const end = try byteAt(measured, work, &states[index], sites.items[index].text, high - position.start_unit);
            const bytes = sites.items[index].text[start..end];
            same.feed(bytes);
            if (item.expected != null) expected.feed(bytes);
            tick(measured, work, "comparison_bytes", bytes.len);
            if (item.expected != null) tick(measured, work, "comparison_bytes", bytes.len);
            try fragments.append(a, .{ .site = index, .start = start, .end = end, .unit_start = low - position.start_unit, .unit_end = high - position.start_unit });
        }
        // Each deleted segment is visited at most once plus the partial segment
        // shared by consecutive independent edits (no per-match full prefix).
        delete_cursor = cursor;
        if (cursor != 0 and positions[cursor - 1].end_unit > item.end) delete_cursor = cursor - 1;
        if (item.expected != null and !expected.matches()) return error.ExpectedTextMismatch;
        const inserted_units = try model.utf16Units(item.text);
        const no_op = same.matches();
        const inherit_first_replaced = !no_op and item.start < item.end and inserted_units != 0 and options.replacement_inheritance == .first_replaced;
        if (inherit_first_replaced) {
            // Reuse the already validated first deleted scalar slice. Empty
            // sites and preceding inclusive ends cannot own the replaced text.
            if (fragments.items.len == 0) return error.InvalidTextPosition;
            const first = fragments.items[0];
            if (explicit_site) |supplied| if (supplied != first.site) return error.InvalidInsertionSite;
            target = first.site;
            insert_byte = first.start;
        }
        const insertion_start = std.math.add(u32, item.start - deleted_units, added_units) catch return error.LimitExceeded;
        effective[edit_index] = .{ .start = item.start, .end = item.end, .insertion_site = target, .inserted_units = inserted_units, .inserted_start = insertion_start, .inserted_end = std.math.add(u32, insertion_start, inserted_units) catch return error.LimitExceeded };
        if (no_op) {
            effective[edit_index].inserted_units = 0;
            effective[edit_index].inserted_end = insertion_start;
            continue; // no site/run redistribution for this edit
        }
        const index = target orelse return error.InvalidTextPosition;
        changed = true;
        effective[edit_index].changed = true;
        deleted_units += item.end - item.start;
        added_units = std.math.add(u32, added_units, inserted_units) catch return error.LimitExceeded;
        try appendCut(a, &cuts, &states[index], .{ .start = insert_byte, .end = insert_byte, .text = item.text, .unit_start = item.start - positions[states[index].segment.?].start_unit, .unit_end = item.start - positions[states[index].segment.?].start_unit, .inserted_units = inserted_units, .inherit_first_replaced = inherit_first_replaced });
        for (fragments.items) |fragment| try appendCut(a, &cuts, &states[fragment.site], .{ .start = fragment.start, .end = fragment.end, .text = "", .unit_start = fragment.unit_start, .unit_end = fragment.unit_end, .inserted_units = 0 });
    }
    // Compute complete final byte limits before allocation/commit. No-op edits
    // were omitted independently; whole-output equality never cancels real edits.
    var deleted_bytes: usize = 0;
    var inserted_bytes: usize = 0;
    for (states) |state| {
        var cut_index = state.head;
        while (cut_index != none) {
            const cut = cuts.items[cut_index];
            deleted_bytes = std.math.add(usize, deleted_bytes, cut.end - cut.start) catch return error.LimitExceeded;
            inserted_bytes = std.math.add(usize, inserted_bytes, cut.text.len) catch return error.LimitExceeded;
            cut_index = cut.next;
        }
    }
    total_bytes = std.math.add(usize, total_bytes - deleted_bytes, inserted_bytes) catch return error.LimitExceeded;
    if (total_bytes > options.max_bytes) return error.LimitExceeded;
    for (sites.items, states, 0..) |site, *state, index| {
        if (state.head == none) continue;
        try sites.prepareTextCommit(index);
        var removed: usize = 0;
        var added: usize = 0;
        var cut_index = state.head;
        while (cut_index != none) {
            const cut = cuts.items[cut_index];
            removed += cut.end - cut.start;
            added = std.math.add(usize, added, cut.text.len) catch return error.LimitExceeded;
            cut_index = cut.next;
        }
        const size = std.math.add(usize, site.text.len - removed, added) catch return error.LimitExceeded;
        const buffer = try a.alloc(u8, size);
        state.replacement = buffer;
        tick(measured, work, "buffers", 1);
        var source_cursor: usize = 0;
        var output: usize = 0;
        cut_index = state.head;
        while (cut_index != none) {
            tick(measured, work, "cut_visits", 1);
            const cut = cuts.items[cut_index];
            const kept = site.text[source_cursor..cut.start];
            @memcpy(buffer[output..][0..kept.len], kept);
            output += kept.len;
            @memcpy(buffer[output..][0..cut.text.len], cut.text);
            output += cut.text.len;
            source_cursor = cut.end;
            cut_index = cut.next;
        }
        @memcpy(buffer[output..], site.text[source_cursor..]);
        tick(measured, work, "output_bytes", size);
    }
    // Outputs consumed every borrowed edit view. Only owned snapshots and unit
    // plans survive preparation, so metadata may be prepared after inputs retire.
    for (cuts.items) |*cut| cut.text = &.{};
    const changes = try cuts.toOwnedSlice(a);
    return .{ .allocator = a, .source = sites, .items_pointer = sites.items.ptr, .backing_map = sites.delta_buffers.storage, .backing_count = sites.delta_buffers.count(), .watch = sites.delta_watch, .serial = if (sites.delta_watch) |watch| watch.serial.* else 0, .active = if (sites.delta_watch) |watch| watch.active.* else false, .states = states, .source_copy = source_copy, .boundaries = boundaries, .positions = owned_positions, .edits = effective, .changes = changes, .changed = changed };
}
