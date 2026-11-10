const std = @import("std");
const transaction = @import("text_splice_transaction.zig");
test "HX independent bulk r1 entrypoint exists" {
    try std.testing.expect(@hasDecl(transaction, "spliceManyProjected"));
}

const a = std.testing.allocator;
const Sites = @import("text_sites.zig").Sites;
const Site = @import("text_sites.zig").Site;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Edit = @import("../model/independent_text_edits.zig").Edit;
const opts: transaction.BulkOptions = .{ .max_bytes = 1_000_000 };
const Fixture = struct {
    sites: Sites,
    positions: []Segment,
    fn init(allocator: std.mem.Allocator, texts: []const []const u8) !Fixture {
        const items = try allocator.alloc(Site, texts.len);
        var count: usize = 0;
        errdefer {
            for (items[0..count]) |site| allocator.free(site.text);
            allocator.free(items);
        }
        const positions = try allocator.alloc(Segment, texts.len);
        errdefer allocator.free(positions);
        var unit: usize = 0;
        for (texts, 0..) |text, index| {
            items[index] = .{ .element_index = 5 + index, .start = 100 + index * 8, .end = 104 + index * 8, .text = try allocator.dupe(u8, text) };
            count += 1;
            const end = unit + try @import("text_site_edit.zig").utf16Length(text);
            positions[index] = .{ .kind = .text, .index = index, .source_start = items[index].start, .start_unit = unit, .end_unit = end };
            unit = end;
        }
        return .{ .sites = .{ .items = items }, .positions = positions };
    }
    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        self.sites.deinit(allocator);
        allocator.free(self.positions);
    }
};
fn reaxis(allocator: std.mem.Allocator, sites: *const Sites, template: []const Segment) ![]Segment {
    const output = try allocator.dupe(Segment, template);
    errdefer allocator.free(output);
    var cursor: usize = 0;
    for (output) |*segment| {
        segment.start_unit = cursor;
        cursor += if (segment.kind == .text) try @import("text_site_edit.zig").utf16Length(sites.items[segment.index].text) else 1;
        segment.end_unit = cursor;
    }
    return output;
}
fn semantic(sites: *const Sites, positions: []const Segment) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    for (positions) |position| try bytes.appendSlice(a, @import("paragraph_text_positions.zig").segmentText(sites, position));
    return bytes.toOwnedSlice(a);
}
fn unchanged(sites: *const Sites, before: *const Sites) !void {
    try std.testing.expectEqual(before.items.len, sites.items.len);
    for (sites.items, before.items) |now, old| {
        try std.testing.expectEqual(old.text.ptr, now.text.ptr);
        try std.testing.expectEqualDeep(old, now);
    }
    try std.testing.expectEqual(before.delta_watch, sites.delta_watch);
    try std.testing.expectEqual(before.delta_buffers.storage, sites.delta_buffers.storage);
}

test "HX independent bulk r1 original Unicode coordinates adjacent delete insert and expected across sites" {
    var f = try Fixture.init(a, &.{ "한😀", "e\xcc\x81BC", "끝" });
    defer f.deinit(a);
    const bindings = try a.dupe(Site, f.sites.items);
    defer a.free(bindings);
    const edits = [_]Edit{
        .{ .start = 1, .end = 3, .text = "X", .expected = "😀" },
        .{ .start = 3, .end = 5, .text = "", .expected = "e\xcc\x81" },
        .{ .start = 5, .end = 5, .text = "👾" },
        .{ .start = 6, .end = 8, .text = "尾", .expected = "C끝" },
    };
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &edits, opts));
    const text = try semantic(&f.sites, f.positions);
    defer a.free(text);
    try std.testing.expectEqualStrings("한X👾B尾", text);
    for (f.sites.items, bindings) |now, old| {
        try std.testing.expectEqual(old.element_index, now.element_index);
        try std.testing.expectEqual(old.start, now.start);
        try std.testing.expectEqual(old.end, now.end);
    }
}

test "HX independent bulk r1 per edit noops preserve styled site distribution and pointers" {
    var f = try Fixture.init(a, &.{ "a", "b", "cd" });
    defer f.deinit(a);
    const first = f.sites.items[0].text.ptr;
    const second = f.sites.items[1].text.ptr;
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &.{
        .{ .start = 0, .end = 2, .text = "ab", .expected = "ab" },
        .{ .start = 3, .end = 4, .text = "D" },
    }, opts));
    try std.testing.expectEqual(first, f.sites.items[0].text.ptr);
    try std.testing.expectEqual(second, f.sites.items[1].text.ptr);
    try std.testing.expectEqualStrings("a", f.sites.items[0].text);
    try std.testing.expectEqualStrings("b", f.sites.items[1].text);
    var g = try Fixture.init(a, &.{"ab"});
    defer g.deinit(a);
    var serial: u64 = std.math.maxInt(u64);
    var active = false;
    g.sites.delta_watch = .{ .serial = &serial, .active = &active };
    try std.testing.expect(!try transaction.spliceManyProjected(a, &g.sites, g.positions, &.{.{ .start = 0, .end = 2, .text = "ab" }}, opts));
    // Two non-noop edits may produce the same whole text, and must remain edits.
    serial = 0;
    try std.testing.expect(try transaction.spliceManyProjected(a, &g.sites, g.positions, &.{
        .{ .start = 0, .end = 1, .text = "" }, .{ .start = 1, .end = 2, .text = "ab" },
    }, opts));
    try std.testing.expectEqualStrings("ab", g.sites.items[0].text);
    try std.testing.expectEqual(@as(u64, 1), serial);
}

test "HX independent bulk r1 explicit insertion affinities retain anchor fallback and single policy" {
    var f = try Fixture.init(a, &.{ "A", "", "B" });
    defer f.deinit(a);
    f.sites.items[1].anchor_boundary = true;
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 1, .end = 1, .text = "x" }}, opts));
    try std.testing.expectEqualStrings("Ax", f.sites.items[0].text);
    var g = try Fixture.init(a, &.{ "A", "", "B" });
    defer g.deinit(a);
    g.sites.items[1].anchor_boundary = true;
    try std.testing.expect(try transaction.spliceManyProjected(a, &g.sites, g.positions, &.{.{ .start = 1, .end = 2, .text = "x" }}, .{ .max_bytes = 100, .insertion_sites = &.{2} }));
    try std.testing.expectEqualStrings("A", g.sites.items[0].text);
    try std.testing.expectEqualStrings("x", g.sites.items[2].text);
    var empty = try Fixture.init(a, &.{""});
    defer empty.deinit(a);
    empty.sites.items[0].anchor_boundary = true;
    try std.testing.expect(try transaction.spliceManyProjected(a, &empty.sites, empty.positions, &.{.{ .start = 0, .end = 0, .text = "😀" }}, opts));
}

test "HX independent bulk r1 late range expected scalar Unicode limits and identity failures are atomic" {
    var f = try Fixture.init(a, &.{ "A😀", "BC" });
    defer f.deinit(a);
    const before: Sites = .{ .items = try a.dupe(Site, f.sites.items) };
    defer a.free(before.items);
    const cases = .{
        .{ error.ExpectedTextMismatch, [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 1, .end = 3, .text = "Z", .expected = "👾" } } },
        .{ error.SplitSurrogatePair, [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 2, .end = 3, .text = "Z" } } },
        .{ error.InvalidTextPosition, [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 5, .end = 6, .text = "Z" } } },
        .{ error.InvalidUtf8, [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 4, .end = 5, .text = "\xff" } } },
        .{ error.InvalidXmlCharacter, [_]Edit{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 4, .end = 5, .text = "\x00" } } },
        .{ error.OverlappingTextEdits, [_]Edit{ .{ .start = 0, .end = 3, .text = "X" }, .{ .start = 1, .end = 3, .text = "Z" } } },
    };
    inline for (cases) |case| {
        const edits = case[1];
        try std.testing.expectError(case[0], transaction.spliceManyProjected(a, &f.sites, f.positions, &edits, opts));
        try unchanged(&f.sites, &before);
    }
    try std.testing.expectError(error.LimitExceeded, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "LONG" }}, .{ .max_bytes = 5 }));
    try std.testing.expectError(error.LimitExceeded, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 0, .text = "X" }}, .{ .max_bytes = 100, .limits = .{ .max_output_units = 5 } }));
    try std.testing.expectError(error.InvalidInsertionSite, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X" }}, .{ .max_bytes = 100, .insertion_sites = &.{1} }));
    f.positions[1].source_start += 1;
    try std.testing.expectError(error.SourceBindingMismatch, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X" }}, opts));
    f.positions[1].source_start -= 1;
    try unchanged(&f.sites, &before);
}

test "HX independent bulk r1 retained tab anchor ranges protected but boundary inserts stay in sites" {
    var f = try Fixture.init(a, &.{ "A😀", "BC", "D" });
    defer f.deinit(a);
    a.free(f.positions);
    f.positions = try a.dupe(Segment, &.{
        .{ .kind = .text, .index = 0, .source_start = f.sites.items[0].start, .start_unit = 0, .end_unit = 3 },
        .{ .kind = .tab, .index = 999, .source_start = 900, .start_unit = 3, .end_unit = 4 },
        .{ .kind = .text, .index = 1, .source_start = f.sites.items[1].start, .start_unit = 4, .end_unit = 6 },
        .{ .kind = .anchor, .index = 1000, .source_start = 901, .start_unit = 6, .end_unit = 7 },
        .{ .kind = .text, .index = 2, .source_start = f.sites.items[2].start, .start_unit = 7, .end_unit = 8 },
    });
    const before: Sites = .{ .items = try a.dupe(Site, f.sites.items) };
    defer a.free(before.items);
    try std.testing.expectError(error.ProtectedInlineControl, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 3, .end = 4, .text = "\t" }}, opts));
    try std.testing.expectError(error.ProtectedInlineControl, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{ .{ .start = 0, .end = 1, .text = "X" }, .{ .start = 6, .end = 7, .text = "" } }, opts));
    try unchanged(&f.sites, &before);
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &.{
        .{ .start = 1, .end = 3, .text = "X" }, .{ .start = 3, .end = 3, .text = "<" }, .{ .start = 4, .end = 4, .text = ">" },
    }, opts));
    const text = try semantic(&f.sites, f.positions);
    defer a.free(text);
    try std.testing.expectEqualStrings("AX<\t>BC\xef\xbf\xbcD", text);
}

test "HX independent bulk r1 borrowed replacements survive one commit and delta mutation watch" {
    var f = try Fixture.init(a, &.{ "AB", "CD" });
    defer f.deinit(a);
    var serial: u64 = 7;
    var active = false;
    f.sites.delta_watch = .{ .serial = &serial, .active = &active };
    const items_pointer = f.sites.items.ptr;
    const edits = [_]Edit{
        .{ .start = 0, .end = 1, .text = f.sites.items[1].text[0..1], .expected = f.sites.items[0].text[0..1] },
        .{ .start = 2, .end = 3, .text = f.sites.items[0].text[0..1], .expected = f.sites.items[1].text[0..1] },
    };
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &edits, .{ .max_bytes = 1_000_000, .insertion_sites = &.{ 0, 1 } }));
    try std.testing.expectEqualStrings("CB", f.sites.items[0].text);
    try std.testing.expectEqualStrings("AD", f.sites.items[1].text);
    try std.testing.expectEqual(@as(u64, 8), serial);
    try std.testing.expectEqual(items_pointer, f.sites.items.ptr);
    active = true;
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "Z" }}, opts));
    try std.testing.expectEqual(@as(u64, 8), serial);
    active = false;
    serial = std.math.maxInt(u64);
    const before: Sites = .{ .items = try a.dupe(Site, f.sites.items), .delta_watch = f.sites.delta_watch };
    defer a.free(before.items);
    try std.testing.expectError(error.HistoryRevisionExhausted, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "Q" }}, opts));
    try unchanged(&f.sites, &before);
}

test "HX independent bulk r1 exhaustive bulk OOM preserves delta allocations prefixes metadata and watch" {
    var measured: usize = 0;
    var sample: usize = 0;
    var failures: usize = 0;
    while (sample == 0 or sample <= measured) : (sample += 1) {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const fa = failing.allocator();
        var f = try Fixture.init(fa, &.{ "A😀B", "CDE" });
        defer f.deinit(fa);
        const length = f.sites.items[0].text.len;
        const backing = try fa.alloc(u8, length + 31);
        @memset(backing, 0xa5);
        @memcpy(backing[0..length], f.sites.items[0].text);
        fa.free(f.sites.items[0].text);
        f.sites.items[0].text = backing[0..length];
        try f.sites.delta_buffers.ensureUnusedCapacity(fa, 1);
        f.sites.delta_buffers.putAssumeCapacity(0, backing);
        var serial: u64 = 41;
        var active = false;
        f.sites.delta_watch = .{ .serial = &serial, .active = &active };
        const snapshot: Sites = .{ .items = try a.dupe(Site, f.sites.items), .delta_watch = f.sites.delta_watch, .delta_buffers = f.sites.delta_buffers };
        defer a.free(snapshot.items);
        const backing_copy = try a.dupe(u8, backing);
        defer a.free(backing_copy);
        const edits = [_]Edit{ .{ .start = 1, .end = 3, .text = f.sites.items[1].text, .expected = "😀" }, .{ .start = 5, .end = 7, .text = f.sites.items[0].text[0..1], .expected = "DE" } };
        const original_items = f.sites.items.ptr;
        const begin = failing.alloc_index;
        if (sample != 0) failing.fail_index = begin + sample - 1;
        const changed = transaction.spliceManyProjected(fa, &f.sites, f.positions, &edits, opts) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(error.OutOfMemory, err);
            failures += 1;
            try std.testing.expectEqual(original_items, f.sites.items.ptr);
            try unchanged(&f.sites, &snapshot);
            try std.testing.expectEqual(@as(u64, 41), serial);
            try std.testing.expectEqualSlices(u8, backing_copy, f.sites.delta_buffers.get(0).?);
            continue;
        };
        try std.testing.expect(sample == 0);
        try std.testing.expect(changed);
        measured = failing.alloc_index - begin;
        try std.testing.expectEqual(@as(u64, 42), serial);
        try std.testing.expect(f.sites.delta_buffers.get(0) == null);
        try std.testing.expectEqualStrings("ACDEB", f.sites.items[0].text);
        try std.testing.expectEqualStrings("CA", f.sites.items[1].text);
    }
    try std.testing.expect(measured > 0);
    try std.testing.expectEqual(measured, failures);
    std.debug.print("BULK_OOM allocation_points={d} rejected={d}\n", .{ measured, failures });
}

test "HX independent bulk r1 projection gaps duplicates output overflow and expected length reject" {
    var f = try Fixture.init(a, &.{ "abc", "D" });
    defer f.deinit(a);
    const first = f.positions[0];
    const last = f.positions[1];
    f.positions[1].start_unit += 1;
    try std.testing.expectError(error.InvalidTextSites, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{}, opts));
    f.positions[1] = last;
    f.positions[1].index = 0;
    f.positions[1].source_start = first.source_start;
    try std.testing.expectError(error.SourceBindingMismatch, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{}, opts));
    f.positions[1] = last;
    f.positions[1].end_unit = std.math.maxInt(u32);
    try std.testing.expectError(error.LimitExceeded, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 0, .text = "X" }}, opts));
    f.positions[1] = last;
    try std.testing.expectError(error.ExpectedTextLengthMismatch, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X", .expected = "😀" }}, opts));
    try std.testing.expectError(error.InvalidUtf8, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X", .expected = "\xff" }}, opts));
    // Ownership checks precede any mutation, even when a later site is forged.
    const bogus = try a.alloc(u8, 16);
    defer a.free(bogus);
    try f.sites.delta_buffers.ensureUnusedCapacity(a, 1);
    f.sites.delta_buffers.putAssumeCapacity(1, bogus);
    try std.testing.expectError(error.HistorySourceOwnershipUncertain, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X" }}, opts));
    _ = f.sites.delta_buffers.fetchRemove(1);
    try std.testing.expectEqualStrings("abc", f.sites.items[0].text);
}

fn differential(texts: []const []const u8, edits: []const Edit, affinity: ?[]const ?usize) !void {
    var many = try Fixture.init(a, texts);
    defer many.deinit(a);
    var single = try Fixture.init(a, texts);
    defer single.deinit(a);
    const changed = try transaction.spliceManyProjected(a, &many.sites, many.positions, edits, .{ .max_bytes = 100_000, .insertion_sites = affinity });
    var any = false;
    var i = edits.len;
    while (i != 0) {
        i -= 1;
        const item = edits[i];
        const positions = try reaxis(a, &single.sites, single.positions);
        defer a.free(positions);
        const selected = if (affinity) |values| values[i] else null;
        any = (try transaction.spliceProjected(a, &single.sites, positions, item.start, item.end - item.start, item.text, 100_000, selected)) or any;
    }
    const bulk_text = try semantic(&many.sites, many.positions);
    defer a.free(bulk_text);
    const single_text = try semantic(&single.sites, single.positions);
    defer a.free(single_text);
    try std.testing.expectEqualStrings(single_text, bulk_text);
    // Individual no-ops are tested separately; reverse application can change
    // a later read's styling distribution, so this oracle is explicitly semantic.
    try std.testing.expectEqual(any, changed);
}

test "HX independent bulk r1 reverse single semantic differential multiple sites Unicode affinity" {
    try differential(&.{ "A😀", "e\xcc\x81BC", "DEF" }, &.{
        .{ .start = 0, .end = 1, .text = "XY" },
        .{ .start = 3, .end = 5, .text = "é" },
        .{ .start = 6, .end = 8, .text = "" },
        .{ .start = 9, .end = 9, .text = "尾" },
    }, null);
    try differential(&.{ "ab", "cd", "ef" }, &.{ .{ .start = 0, .end = 1, .text = "A" }, .{ .start = 2, .end = 3, .text = "C" }, .{ .start = 4, .end = 5, .text = "E" } }, &.{ 0, 1, 2 });
    // A broad deterministic family of independent one-site cuts, including
    // expansion, deletion, adjacent intervals, and pure insertion at final end.
    for (0..30) |seed| {
        var edits: std.ArrayList(Edit) = .empty;
        defer edits.deinit(a);
        for (0..12) |index| {
            const start: u32 = @intCast(index * 2);
            const value: []const u8 = switch ((index + seed) % 4) {
                0 => "X",
                1 => "",
                2 => "😀",
                else => "aa",
            };
            try edits.append(a, .{ .start = start, .end = start + 1, .text = value, .expected = "a" });
        }
        try edits.append(a, .{ .start = 24, .end = 24, .text = "END" });
        try differential(&.{"abababababababababababab"}, edits.items, null);
    }
}

test "HX independent bulk r1 generated and joined current Sites use real current projections" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run></p:p><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='9'><p:t>CDE</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var source = try @import("text_sites.zig").collect(a, &tree, .{});
    defer source.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &source, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &source, locations, .{}, &report);
    defer original.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 1, 1, 3, 10_000);
    defer split.deinit(a);
    const generated = &split.paragraphs[1];
    try std.testing.expect(generated.source_ordinal == null);
    const generated_locations = try @import("paragraph_structure_locations.zig").build(a, &tree, generated);
    defer a.free(generated_locations);
    const gen_positions = try @import("paragraph_text_positions.zig").build(a, &tree, &generated.sites, generated_locations, 1);
    defer a.free(gen_positions);
    try std.testing.expect(try transaction.spliceManyProjected(a, &generated.sites, gen_positions, &.{ .{ .start = 0, .end = 2, .text = "X", .expected = "😀" }, .{ .start = 2, .end = 3, .text = "Y", .expected = "B" } }, opts));
    try std.testing.expectEqualStrings("XY", generated.sites.items[0].text);
    var merged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10_000);
    defer merged.deinit(a);
    const row = &merged.paragraphs[0];
    const joined = row.joined() orelse return error.ExpectedJoinedCurrentSites;
    const joined_positions = try @import("paragraph_joined_positions.zig").build(a, &tree, &joined);
    defer a.free(joined_positions);
    try std.testing.expect(try transaction.spliceManyProjected(a, &row.sites, joined_positions, &.{ .{ .start = 0, .end = 1, .text = "Q" }, .{ .start = 4, .end = 6, .text = "ZW", .expected = "CD" } }, opts));
    const text = try semantic(&row.sites, joined_positions);
    defer a.free(text);
    try std.testing.expectEqualStrings("Q😀BZWE", text);
    try std.testing.expectEqualSlices(u8, xml, tree.source);
    try std.testing.expectEqual(@as(usize, 2), row.pieces.?.len);
}

fn linearCohort(n: usize, multi: bool) !transaction.bulkTesting.Counters {
    const texts = try a.alloc([]const u8, if (multi) n else 1);
    defer a.free(texts);
    const long = try a.alloc(u8, n * 2);
    defer a.free(long);
    for (0..n) |index| @memcpy(long[index * 2 ..][0..2], "ab");
    for (texts) |*text| text.* = if (multi) "ab" else long;
    var f = try Fixture.init(a, texts);
    defer f.deinit(a);
    if (multi) {
        // Current projection order need not match Sites' array/source order.
        for (f.positions, 0..) |*position, index| {
            position.index = n - index - 1;
            position.source_start = f.sites.items[position.index].start;
        }
    }
    const edits = try a.alloc(Edit, n);
    defer a.free(edits);
    for (edits, 0..) |*item, index| item.* = .{ .start = @intCast(index * 2), .end = @intCast(index * 2 + 1), .text = "X", .expected = "a" };
    var work: transaction.bulkTesting.Counters = .{};
    try std.testing.expect(try transaction.bulkTesting.applyMeasured(a, &f.sites, f.positions, edits, opts, &work));
    const text = try semantic(&f.sites, f.positions);
    defer a.free(text);
    for (0..n) |index| try std.testing.expectEqualStrings("Xb", text[index * 2 ..][0..2]);
    try std.testing.expectEqual(n * 2, work.source_bytes);
    try std.testing.expect(work.cursor_bytes <= n * 2);
    try std.testing.expectEqual(n * 2, work.comparison_bytes);
    try std.testing.expectEqual(n * 2, work.output_bytes);
    try std.testing.expectEqual(if (multi) n else @as(usize, 1), work.buffers);
    return work;
}
fn workTotal(work: transaction.bulkTesting.Counters) usize {
    var sum: usize = 0;
    inline for (@import("../reflection.zig").fields(@TypeOf(work))) |field| sum += @field(work, field.name);
    return sum;
}
test "HX independent bulk r1 measured N 2N 4N monotone one site and many sites" {
    for ([_]bool{ false, true }) |multi| {
        var previous: usize = 0;
        for ([_]usize{ 128, 256, 512 }) |n| {
            const work = try linearCohort(n, multi);
            const total = workTotal(work);
            if (previous != 0) try std.testing.expect(total <= previous * 2 + 8);
            try std.testing.expect(total <= n * 32 + 16);
            previous = total;
            std.debug.print("BULK_WORK multi={} N={d} total={d} sites={d} source={d} cursor={d} segments={d} edits={d} boundary={d} comparisons={d} cuts={d} output={d} buffers={d}\n", .{ multi, n, total, work.site_checks, work.source_bytes, work.cursor_bytes, work.segments, work.edit_visits, work.boundary_visits, work.comparison_bytes, work.cut_visits, work.output_bytes, work.buffers });
        }
    }
}

test "HX independent bulk r1 actual constructor projection retains controls comments unknown attributes" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p x:opaque='KEEP'><!--unchanged--><p:run><p:t>A<p:tab width='100'/>B</p:t><p:pic/><p:t>C😀D</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    try std.testing.expect(try transaction.spliceManyProjected(a, &sites, positions, &.{ .{ .start = 0, .end = 1, .text = "a" }, .{ .start = 4, .end = 5, .text = "c" }, .{ .start = 5, .end = 7, .text = "👾", .expected = "😀" } }, opts));
    const text = try semantic(&sites, positions);
    defer a.free(text);
    try std.testing.expectEqualStrings("a\tB\xef\xbf\xbcc👾D", text);
    try std.testing.expectEqualSlices(u8, xml, tree.source);
}

test "HX independent bulk r1 exhaustive growing fragment cut buffers OOM leaves every source site intact" {
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const texts: [24][]const u8 = @splat("abcd");
            var f = try Fixture.init(allocator, &texts);
            defer f.deinit(allocator);
            const before: Sites = .{ .items = try a.dupe(Site, f.sites.items) };
            defer a.free(before.items);
            _ = transaction.spliceManyProjected(allocator, &f.sites, f.positions, &.{ .{ .start = 1, .end = 70, .text = "👾" }, .{ .start = 80, .end = 95, .text = "Z" } }, opts) catch |err| {
                try std.testing.expectEqual(error.OutOfMemory, err);
                try unchanged(&f.sites, &before);
                return err;
            };
            const text = try semantic(&f.sites, f.positions);
            defer a.free(text);
            try std.testing.expectEqualStrings("a👾cdabcdabcdZd", text);
        }
    }.run, .{});
}

test "HX independent bulk r1 full deletion empty insertion unchanged flags and aggregate budgets" {
    var f = try Fixture.init(a, &.{ "😀", "e\xcc\x81" });
    defer f.deinit(a);
    f.sites.items[0].empty_element = true;
    f.sites.items[0].missing_text = true;
    try std.testing.expectError(error.LimitExceeded, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{ .{ .start = 0, .end = 0, .text = "X" }, .{ .start = 2, .end = 2, .text = "Y" } }, .{ .max_bytes = 100, .limits = .{ .max_edits = 1 } }));
    try std.testing.expectError(error.LimitExceeded, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 0, .text = "😀" }}, .{ .max_bytes = 100, .limits = .{ .max_inserted_bytes = 3 } }));
    try std.testing.expectError(error.InvalidInsertionSite, transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 0, .text = "X" }}, .{ .max_bytes = 100, .insertion_sites = &.{} }));
    try std.testing.expect(try transaction.spliceManyProjected(a, &f.sites, f.positions, &.{.{ .start = 0, .end = 4, .text = "", .expected = "😀e\xcc\x81" }}, .{ .max_bytes = 0 }));
    try std.testing.expectEqualStrings("", f.sites.items[0].text);
    try std.testing.expectEqualStrings("", f.sites.items[1].text);
    try std.testing.expect(f.sites.items[0].empty_element);
    try std.testing.expect(f.sites.items[0].missing_text);
    const empty_positions = try reaxis(a, &f.sites, f.positions);
    defer a.free(empty_positions);
    try std.testing.expect(!try transaction.spliceManyProjected(a, &f.sites, empty_positions, &.{.{ .start = 0, .end = 0, .text = "", .expected = "" }}, .{ .max_bytes = 0 }));
}

const style_bulk = @import("character_style_splice.zig");
const PaintSpan = @import("character_style_paint.zig").Span;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Styled = struct {
    paragraph: Paragraph,
    positions: []Segment,
    fn init(allocator: std.mem.Allocator, texts: []const []const u8) !Styled {
        var fixture = try Fixture.init(allocator, texts);
        errdefer fixture.deinit(allocator);
        const styles = try allocator.alloc(PaintSpan, texts.len);
        for (styles, fixture.positions, 0..) |*span, position, index| span.* = .{
            .start_unit = position.start_unit,
            .end_unit = position.end_unit,
            .site_start_unit = position.start_unit,
            .site_index = index,
            .run_element = 40 + index,
            .char_shape_id = @intCast(7 + index),
        };
        return .{ .paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = fixture.sites, .character_styles = styles }, .positions = fixture.positions };
    }
    fn deinit(self: *Styled, allocator: std.mem.Allocator) void {
        self.paragraph.deinit(allocator);
        allocator.free(self.positions);
    }
};
fn styleDifferential(texts: []const []const u8, edits: []const Edit, affinity: ?[]const ?usize) !void {
    return styleDifferentialRows(texts, edits, affinity, null);
}
fn styleDifferentialRows(texts: []const []const u8, edits: []const Edit, affinity: ?[]const ?usize, rows: ?[]const PaintSpan) !void {
    var bulk = try Styled.init(a, texts);
    defer bulk.deinit(a);
    var single = try Styled.init(a, texts);
    defer single.deinit(a);
    if (rows) |source_rows| {
        a.free(bulk.paragraph.character_styles.?);
        bulk.paragraph.character_styles = null;
        bulk.paragraph.character_styles = try a.dupe(PaintSpan, source_rows);
        a.free(single.paragraph.character_styles.?);
        single.paragraph.character_styles = null;
        single.paragraph.character_styles = try a.dupe(PaintSpan, source_rows);
    }
    var text = try transaction.prepareManyProjected(a, &bulk.paragraph.sites, bulk.positions, edits, .{ .max_bytes = 100_000, .insertion_sites = affinity });
    defer text.deinit();
    var metadata = try style_bulk.prepareManyProjected(a, &bulk.paragraph, &text, bulk.paragraph.character_styles.?, 100_000);
    defer metadata.deinit();
    var changed = false;
    var i = edits.len;
    while (i != 0) {
        i -= 1;
        const item = edits[i];
        const positions = try reaxis(a, &single.paragraph.sites, single.positions);
        defer a.free(positions);
        const target = if (affinity) |values| values[i] orelse transaction.insertionSite(&single.paragraph.sites, positions, item.start).? else transaction.insertionSite(&single.paragraph.sites, positions, item.start).?;
        changed = (try style_bulk.splicePositionsAtSite(a, &single.paragraph, positions, item.start, item.end - item.start, item.text, 100_000, target)) or changed;
    }
    try std.testing.expectEqual(changed, try metadata.commit(&bulk.paragraph, &text));
    for (bulk.paragraph.sites.items, single.paragraph.sites.items) |now, expected| try std.testing.expectEqualStrings(expected.text, now.text);
    try std.testing.expectEqualDeep(single.paragraph.character_styles.?, bulk.paragraph.character_styles.?);
}

test "HX independent metadata r2 exact legacy styled single differentials Unicode adjacent affinity noops" {
    try styleDifferential(&.{ "A😀", "BC", "DEF" }, &.{ .{ .start = 0, .end = 1, .text = "XX" }, .{ .start = 3, .end = 4, .text = "c" }, .{ .start = 6, .end = 8, .text = "Z" } }, null);
    try styleDifferential(&.{ "ab", "cd", "ef" }, &.{ .{ .start = 0, .end = 1, .text = "" }, .{ .start = 1, .end = 2, .text = "😀" }, .{ .start = 2, .end = 2, .text = "X" }, .{ .start = 4, .end = 6, .text = "" } }, &.{ 0, 0, 1, 2 });
    try styleDifferential(&.{ "a", "b", "cd" }, &.{ .{ .start = 0, .end = 2, .text = "ab", .expected = "ab" }, .{ .start = 3, .end = 4, .text = "D" } }, null);
    try styleDifferential(&.{ "e\xcc\x81", "😀", "tail" }, &.{ .{ .start = 0, .end = 2, .text = "é" }, .{ .start = 4, .end = 4, .text = "Q" }, .{ .start = 5, .end = 8, .text = "" } }, null);
}

test "HX independent metadata r2 owned text draft flags extents abort no mutation and noalloc commit" {
    var f = try Styled.init(a, &.{ "ab", "CD" });
    defer f.deinit(a);
    var serial: u64 = 3;
    var active = false;
    f.paragraph.sites.delta_watch = .{ .serial = &serial, .active = &active };
    var failing = std.testing.FailingAllocator.init(a, .{});
    const fa = failing.allocator();
    var text = try transaction.prepareManyProjected(fa, &f.paragraph.sites, f.positions, &.{ .{ .start = 0, .end = 1, .text = "a", .expected = "a" }, .{ .start = 2, .end = 3, .text = "😀", .expected = "C" } }, .{ .max_bytes = 100, .insertion_sites = &.{ 0, 1 } });
    defer text.deinit();
    try std.testing.expect(!text.edits[0].changed);
    try std.testing.expectEqual(@as(u32, 0), text.edits[0].inserted_units);
    try std.testing.expect(text.edits[1].changed);
    try std.testing.expectEqual(@as(?usize, 1), text.edits[1].insertion_site);
    try std.testing.expectEqual(@as(u32, 2), text.edits[1].inserted_start);
    try std.testing.expectEqual(@as(u32, 4), text.edits[1].inserted_end);
    try std.testing.expectEqualStrings("CD", f.paragraph.sites.items[1].text);
    try std.testing.expectEqual(@as(u64, 3), serial);
    var metadata = try style_bulk.prepareManyProjected(fa, &f.paragraph, &text, f.paragraph.character_styles.?, 1000);
    defer metadata.deinit();
    failing.fail_index = failing.alloc_index;
    try std.testing.expect(try metadata.commit(&f.paragraph, &text));
    try std.testing.expectEqual(@as(u64, 4), serial);
    try std.testing.expectEqualStrings("😀D", f.paragraph.sites.items[1].text);
    try std.testing.expectError(error.StaleTextDraft, text.commit(&f.paragraph.sites));
}

test "HX independent metadata r2 stale content buffer watch and style receipts reject before commit" {
    for (0..6) |mode| {
        var f = try Styled.init(a, &.{ "AB", "CD" });
        defer f.deinit(a);
        var serial: u64 = 1;
        var active = false;
        f.paragraph.sites.delta_watch = .{ .serial = &serial, .active = &active };
        var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, &.{.{ .start = 0, .end = 1, .text = "X" }}, opts);
        defer text.deinit();
        var metadata = try style_bulk.prepareManyProjected(a, &f.paragraph, &text, f.paragraph.character_styles.?, 1000);
        defer metadata.deinit();
        const second = f.paragraph.sites.items[1].text.ptr;
        switch (mode) {
            0 => f.paragraph.sites.items[0].text[0] = 'Q',
            1 => serial += 1,
            2 => active = true,
            3 => f.paragraph.sites.items[0].start += 1,
            4 => f.paragraph.character_styles.?[0].char_shape_id = 123,
            5 => {
                const replacement = try a.dupe(u8, f.paragraph.sites.items[0].text);
                a.free(f.paragraph.sites.items[0].text);
                f.paragraph.sites.items[0].text = replacement;
            },
            else => unreachable,
        }
        try std.testing.expectError(if (mode == 4) error.StaleStyleDraft else error.StaleTextDraft, metadata.commit(&f.paragraph, &text));
        try std.testing.expectEqual(second, f.paragraph.sites.items[1].text.ptr);
        try std.testing.expectEqualStrings("CD", f.paragraph.sites.items[1].text);
        try std.testing.expectEqual(if (mode == 0) @as(u8, 'Q') else @as(u8, 'A'), f.paragraph.sites.items[0].text[0]);
    }
}

test "HX independent metadata r2 metadata OOM abort leaves source text style watch unchanged" {
    var f = try Styled.init(a, &.{ "A😀B", "CD" });
    defer f.deinit(a);
    var serial: u64 = 0;
    var active = false;
    f.paragraph.sites.delta_watch = .{ .serial = &serial, .active = &active };
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, &.{ .{ .start = 1, .end = 3, .text = "X" }, .{ .start = 5, .end = 6, .text = "Y" } }, opts);
    defer text.deinit();
    const pointer = f.paragraph.character_styles.?.ptr;
    const bytes = f.paragraph.sites.items[0].text.ptr;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, p: *Paragraph, t: *transaction.Prepared) !void {
            var metadata = try style_bulk.prepareManyProjected(allocator, p, t, p.character_styles.?, 1000);
            defer metadata.deinit();
        }
    }.run, .{ &f.paragraph, &text });
    try std.testing.expectEqual(pointer, f.paragraph.character_styles.?.ptr);
    try std.testing.expectEqual(bytes, f.paragraph.sites.items[0].text.ptr);
    try std.testing.expectEqual(@as(u64, 0), serial);
    try std.testing.expectEqualStrings("A😀B", f.paragraph.sites.items[0].text);
}

test "HX independent metadata r2 original style span boundary affinity exact single and scalar rejection" {
    const rows = [_]PaintSpan{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = 7 },
        .{ .start_unit = 1, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = 8 },
        .{ .start_unit = 3, .end_unit = 5, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = 9 },
    };
    try styleDifferentialRows(&.{"a😀bc"}, &.{ .{ .start = 1, .end = 1, .text = "X" }, .{ .start = 3, .end = 4, .text = "Q" } }, null, &rows);
    try styleDifferentialRows(&.{"a😀bc"}, &.{ .{ .start = 0, .end = 1, .text = "a" }, .{ .start = 1, .end = 3, .text = "X" }, .{ .start = 3, .end = 4, .text = "Y" } }, null, &rows);
    var f = try Styled.init(a, &.{"a😀bc"});
    defer f.deinit(a);
    a.free(f.paragraph.character_styles.?);
    f.paragraph.character_styles = try a.dupe(PaintSpan, &rows);
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, &.{.{ .start = 4, .end = 5, .text = "Z" }}, opts);
    defer text.deinit();
    f.paragraph.character_styles.?[1].end_unit = 2;
    f.paragraph.character_styles.?[2].start_unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, style_bulk.prepareManyProjected(a, &f.paragraph, &text, f.paragraph.character_styles.?, 1000));
    try std.testing.expectEqualStrings("a😀bc", f.paragraph.sites.items[0].text);
}

fn treeStyles(tree: *const @import("xml_part_tree.zig").Tree, sites: *const Sites, positions: []const Segment) ![]PaintSpan {
    const rows = try a.alloc(PaintSpan, positions.len);
    errdefer a.free(rows);
    for (positions, rows) |position, *span| {
        var node = if (position.kind == .text) sites.items[position.index].element_index else position.index;
        while (!tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "run")) node = tree.elements[node].parent orelse return error.MissingRun;
        const raw = (try tree.attributeValue(a, node, "", "charPrIDRef")) orelse return error.MissingCharacterShapeReference;
        span.* = .{ .start_unit = position.start_unit, .end_unit = position.end_unit, .site_start_unit = position.start_unit, .site_index = if (position.kind == .text) position.index else 0, .run_element = node, .char_shape_id = try @import("table_xml_fields.zig").unsigned(a, raw, 100), .tab_element = if (position.kind != .text and position.kind != .anchor) position.index else null, .anchor_element = if (position.kind == .anchor) position.index else null };
    }
    return rows;
}
fn validatePaint(paragraph: *const Paragraph) !void {
    const rows = try @import("character_style_paint.zig").prepare(a, &paragraph.sites, paragraph.character_styles.?, 0, 0, 7, &.{ 7, 8, 9, 10 }, 100_000);
    defer a.free(rows);
}
test "HX independent metadata r2 source generated joined real provenance text style coherent" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='7' x:opaque='KEEP'><p:t>A😀B</p:t></p:run></p:p><p:p id='2' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='9'><p:t>CDE</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var source = try @import("text_sites.zig").collect(a, &tree, .{});
    defer source.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &source, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &source, locations, .{}, &report);
    defer original.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 1, 1, 3, 10000);
    defer split.deinit(a);
    const generated = &split.paragraphs[1];
    const gen_locs = try @import("paragraph_structure_locations.zig").build(a, &tree, generated);
    defer a.free(gen_locs);
    const gen_pos = try @import("paragraph_text_positions.zig").build(a, &tree, &generated.sites, gen_locs, 1);
    defer a.free(gen_pos);
    const gen_rows = try treeStyles(&tree, &generated.sites, gen_pos);
    defer a.free(gen_rows);
    var gen_text = try transaction.prepareManyProjected(a, &generated.sites, gen_pos, &.{ .{ .start = 0, .end = 2, .text = "X" }, .{ .start = 2, .end = 3, .text = "YZ" } }, opts);
    defer gen_text.deinit();
    var gen_meta = try style_bulk.prepareManyProjected(a, generated, &gen_text, gen_rows, 1000);
    defer gen_meta.deinit();
    try std.testing.expect(try gen_meta.commit(generated, &gen_text));
    try validatePaint(generated);
    try std.testing.expectEqualStrings("XYZ", generated.sites.items[0].text);
    var joined_values = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000);
    defer joined_values.deinit(a);
    const joined = &joined_values.paragraphs[0];
    const view = joined.joined().?;
    const join_pos = try @import("paragraph_joined_positions.zig").build(a, &tree, &view);
    defer a.free(join_pos);
    const join_rows = try treeStyles(&tree, &joined.sites, join_pos);
    defer a.free(join_rows);
    var join_text = try transaction.prepareManyProjected(a, &joined.sites, join_pos, &.{ .{ .start = 1, .end = 3, .text = "XX" }, .{ .start = 5, .end = 7, .text = "Y" } }, opts);
    defer join_text.deinit();
    var join_meta = try style_bulk.prepareManyProjected(a, joined, &join_text, join_rows, 1000);
    defer join_meta.deinit();
    try std.testing.expect(try join_meta.commit(joined, &join_text));
    try validatePaint(joined);
    const joined_text = try semantic(&joined.sites, join_pos);
    defer a.free(joined_text);
    try std.testing.expectEqualStrings("AXXBCY", joined_text);
    try std.testing.expectEqualSlices(u8, xml, tree.source);
}

test "HX independent metadata r2 retained tab anchor provenance shifts coherent with text" {
    var f = try Styled.init(a, &.{ "A😀", "BC", "D" });
    defer f.deinit(a);
    a.free(f.positions);
    f.positions = try a.dupe(Segment, &.{
        .{ .kind = .text, .index = 0, .source_start = f.paragraph.sites.items[0].start, .start_unit = 0, .end_unit = 3 },
        .{ .kind = .tab, .index = 900, .source_start = 300, .start_unit = 3, .end_unit = 4 },
        .{ .kind = .text, .index = 1, .source_start = f.paragraph.sites.items[1].start, .start_unit = 4, .end_unit = 6 },
        .{ .kind = .anchor, .index = 901, .source_start = 400, .start_unit = 6, .end_unit = 7 },
        .{ .kind = .text, .index = 2, .source_start = f.paragraph.sites.items[2].start, .start_unit = 7, .end_unit = 8 },
    });
    a.free(f.paragraph.character_styles.?);
    f.paragraph.character_styles = try a.dupe(PaintSpan, &.{
        .{ .start_unit = 0, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = 7 },
        .{ .start_unit = 3, .end_unit = 4, .site_start_unit = 3, .site_index = 0, .run_element = 40, .char_shape_id = 7, .tab_element = 900 },
        .{ .start_unit = 4, .end_unit = 6, .site_start_unit = 4, .site_index = 1, .run_element = 41, .char_shape_id = 8 },
        .{ .start_unit = 6, .end_unit = 7, .site_start_unit = 6, .site_index = 0, .run_element = 41, .char_shape_id = 8, .anchor_element = 901 },
        .{ .start_unit = 7, .end_unit = 8, .site_start_unit = 7, .site_index = 2, .run_element = 42, .char_shape_id = 9 },
    });
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, &.{ .{ .start = 1, .end = 3, .text = "X" }, .{ .start = 4, .end = 4, .text = "YZ" } }, opts);
    defer text.deinit();
    var metadata = try style_bulk.prepareManyProjected(a, &f.paragraph, &text, f.paragraph.character_styles.?, 1000);
    defer metadata.deinit();
    try std.testing.expect(try metadata.commit(&f.paragraph, &text));
    try validatePaint(&f.paragraph);
    const rows = f.paragraph.character_styles.?;
    try std.testing.expectEqual(@as(?usize, 900), rows[1].tab_element);
    try std.testing.expectEqual(@as(usize, 2), rows[1].start_unit);
    try std.testing.expectEqual(@as(?usize, 901), rows[3].anchor_element);
    try std.testing.expectEqual(@as(usize, 7), rows[3].start_unit);
}

fn metadataWork(n: usize, multi: bool) !usize {
    const texts = try a.alloc([]const u8, if (multi) n else 1);
    defer a.free(texts);
    const long = try a.alloc(u8, n * 2);
    defer a.free(long);
    for (0..n) |i| @memcpy(long[i * 2 ..][0..2], "ab");
    for (texts) |*value| value.* = if (multi) "ab" else long;
    var f = try Styled.init(a, texts);
    defer f.deinit(a);
    if (!multi) {
        a.free(f.paragraph.character_styles.?);
        f.paragraph.character_styles = try a.alloc(PaintSpan, n * 2);
        for (f.paragraph.character_styles.?, 0..) |*span, i| span.* = .{ .start_unit = i, .end_unit = i + 1, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = @intCast(7 + i % 2) };
    }
    const edits = try a.alloc(Edit, n);
    defer a.free(edits);
    for (edits, 0..) |*item, i| item.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = "X" };
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, edits, opts);
    defer text.deinit();
    var work: style_bulk.bulkTesting.Counters = .{};
    var metadata = try style_bulk.bulkTesting.prepareMeasured(a, &f.paragraph, &text, f.paragraph.character_styles.?, 100_000, &work);
    defer metadata.deinit();
    try std.testing.expect(try metadata.commit(&f.paragraph, &text));
    var total: usize = 0;
    inline for (@import("../reflection.zig").fields(@TypeOf(work))) |field| total += @field(work, field.name);
    std.debug.print("STYLE_WORK multi={} N={d} total={d} spans={d} segments={d} changes={d} emits={d}\n", .{ multi, n, total, work.spans, work.segments, work.changes, work.emits });
    try std.testing.expect(total <= n * 16 + 8);
    return total;
}
test "HX independent metadata r2 N 2N 4N style spans segments edits output linear counters" {
    for ([_]bool{ false, true }) |multi| {
        var prior: usize = 0;
        for ([_]usize{ 128, 256, 512 }) |n| {
            const total = try metadataWork(n, multi);
            if (prior != 0) try std.testing.expect(total <= prior * 2 + 8);
            prior = total;
        }
    }
}

test "HX independent metadata r2 prepared inputs retire before metadata and mismatches never yield draft" {
    var f = try Styled.init(a, &.{ "AB", "CD" });
    defer f.deinit(a);
    const replacement = try a.dupe(u8, "😀");
    const projection = try a.dupe(Segment, f.positions);
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, projection, &.{.{ .start = 0, .end = 1, .text = replacement, .expected = "A" }}, opts);
    defer text.deinit();
    a.free(replacement);
    a.free(projection);
    try std.testing.expectEqualStrings("😀B", text.outputText(0));
    try std.testing.expectEqualStrings("AB", text.sourceText(0));
    var metadata = try style_bulk.prepareManyProjected(a, &f.paragraph, &text, f.paragraph.character_styles.?, 1000);
    defer metadata.deinit();
    try std.testing.expect(try metadata.commit(&f.paragraph, &text));
    try validatePaint(&f.paragraph);
    const current = try reaxis(a, &f.paragraph.sites, f.positions);
    defer a.free(current);
    try std.testing.expectError(error.ExpectedTextMismatch, transaction.prepareManyProjected(a, &f.paragraph.sites, current, &.{.{ .start = 0, .end = 2, .text = "X", .expected = "👾" }}, opts));
    try std.testing.expectEqualStrings("😀B", f.paragraph.sites.items[0].text);
}

test "HX independent metadata r2 deterministic exact styled differential families and all noop" {
    var rows: [12]PaintSpan = undefined;
    for (&rows, 0..) |*span, i| span.* = .{ .start_unit = i, .end_unit = i + 1, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = @intCast(7 + i % 2) };
    for (0..24) |seed| {
        var edits: [6]Edit = undefined;
        for (&edits, 0..) |*item, i| item.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = switch ((seed + i) % 4) {
            0 => "",
            1 => "X",
            2 => "😀",
            else => "ab",
        }, .expected = "a" };
        try styleDifferentialRows(&.{"abababababab"}, &edits, null, &rows);
    }
    try styleDifferentialRows(&.{"abababababab"}, &.{.{ .start = 0, .end = 12, .text = "abababababab" }}, null, &rows);
}

test "HX independent metadata r2 actual source inline run attributes and unsupported title boundary" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p id='1'><p:run charPrIDRef='7' x:unknown='KEEP'><!--retained--><p:t>A<p:tab/>B</p:t><p:pic/><p:t>C😀D</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    var paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
    defer paragraph.deinit(a);
    sites = undefined;
    const locations = try @import("text_site_locations.zig").build(a, &tree, &paragraph.sites, .{});
    defer a.free(locations);
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, &tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    const rows = try treeStyles(&tree, &paragraph.sites, positions);
    defer a.free(rows);
    var text = try transaction.prepareManyProjected(a, &paragraph.sites, positions, &.{ .{ .start = 0, .end = 1, .text = "aaa" }, .{ .start = 5, .end = 7, .text = "X" } }, opts);
    defer text.deinit();
    var metadata = try style_bulk.prepareManyProjected(a, &paragraph, &text, rows, 1000);
    defer metadata.deinit();
    try std.testing.expect(try metadata.commit(&paragraph, &text));
    try validatePaint(&paragraph);
    for (paragraph.character_styles.?) |span| try std.testing.expectEqual(rows[0].run_element, span.run_element);
    try std.testing.expectEqualSlices(u8, xml, tree.source);
    const current = try reaxis(a, &paragraph.sites, positions);
    defer a.free(current);
    var next = try transaction.prepareManyProjected(a, &paragraph.sites, current, &.{.{ .start = 0, .end = 1, .text = "Z" }}, opts);
    defer next.deinit();
    paragraph.character_styles.?[0].canonical_fragment = 77;
    try std.testing.expectError(error.UnsupportedTitleFormattingProjection, style_bulk.prepareManyProjected(a, &paragraph, &next, paragraph.character_styles.?, 1000));
    try std.testing.expectEqualStrings("aaa", paragraph.sites.items[0].text);
}

test "HX independent metadata r2 growing style output exhaustive OOM retains prepared and live values" {
    const n = 64;
    const source = try a.alloc(u8, n * 2);
    defer a.free(source);
    for (0..n) |i| @memcpy(source[i * 2 ..][0..2], "ab");
    var f = try Styled.init(a, &.{source});
    defer f.deinit(a);
    a.free(f.paragraph.character_styles.?);
    f.paragraph.character_styles = try a.alloc(PaintSpan, n * 2);
    for (f.paragraph.character_styles.?, 0..) |*span, i| span.* = .{ .start_unit = i, .end_unit = i + 1, .site_start_unit = 0, .site_index = 0, .run_element = 40, .char_shape_id = @intCast(7 + i % 2) };
    var edits: [n]Edit = undefined;
    for (&edits, 0..) |*item, i| item.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = "X" };
    var text = try transaction.prepareManyProjected(a, &f.paragraph.sites, f.positions, &edits, opts);
    defer text.deinit();
    const pointer = f.paragraph.character_styles.?.ptr;
    const bytes = f.paragraph.sites.items[0].text.ptr;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, p: *Paragraph, t: *transaction.Prepared) !void {
            var metadata = try style_bulk.prepareManyProjected(allocator, p, t, p.character_styles.?, 1000);
            defer metadata.deinit();
        }
    }.run, .{ &f.paragraph, &text });
    try std.testing.expectEqual(pointer, f.paragraph.character_styles.?.ptr);
    try std.testing.expectEqual(bytes, f.paragraph.sites.items[0].text.ptr);
    try std.testing.expectEqualSlices(u8, source, f.paragraph.sites.items[0].text);
    try std.testing.expect(!text.consumed);
    try text.validate(&f.paragraph.sites);
}
