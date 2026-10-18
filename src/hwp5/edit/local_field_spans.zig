//! Derived marker spans for one explicit field kind. No edit permission is granted.
//! Cross-paragraph ownership is limited to root siblings until logical-list
//! identities are supplied; sharing a control parent is not sufficient.
const std = @import("std");
const model = @import("../../model/document.zig");
const controls = @import("../body/control_rules.zig");
const Text = @import("../body/text.zig").Text;
pub const Position = struct { paragraph: usize, unit: u32 };
pub const Span = struct { begin: Position, end: Position, ordinal: usize, field_id: u32 = 0 };

pub fn supportsMixedEditableKind(id: u32) bool {
    return id == controls.id("%hlk") or id == controls.id("%clk") or id == controls.id("%bmk") or id == controls.id("%xrf") or id == controls.id("%fmu");
}

pub fn collect(a: std.mem.Allocator, section: model.Section, id: u32) ![]Span {
    if (id == 0) return error.UnsupportedSectionControl;
    return collectWithOwners(a, section, id, null);
}

/// Mixed hyperlink/click/bookmark/cross-reference/formula spans. Ordinal counts all starts in the
/// originating paragraph, not only starts of the selected field kind.
pub fn collectMixedBound(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) ![]Span {
    return boundWithKind(a, source, version, section, 0);
}

/// Structural read-only ranges for every known field control ID. This does
/// not change the narrower field transaction or result-editing admission.
pub fn collectReadableBound(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) ![]Span {
    return boundWithPolicy(a, source, version, section, 0, true);
}

/// Source-backed logical list identities, not shared control ancestry.
pub fn collectBound(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, id: u32) ![]Span {
    if (id == 0) return error.UnsupportedSectionControl;
    return boundWithKind(a, source, version, section, id);
}

fn boundWithKind(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, id: u32) ![]Span {
    return boundWithPolicy(a, source, version, section, id, false);
}

fn boundWithPolicy(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, id: u32, readable: bool) ![]Span {
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const ownership = @import("paragraph_owner.zig");
    var groups = try ownership.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const owners = try a.alloc(?usize, section.paragraphs.len);
    defer a.free(owners);
    for (section.paragraphs, 0..) |p, index| {
        const node = try @import("field_paragraph_source.zig").resolve(a, source, version, p);
        if (node >= tree.nodes.len) return error.SourceBindingMismatch;
        const parent: ?usize = if (p.parent_node) |value| value else null;
        if (tree.nodes[node].parent != parent) return error.SourceBindingMismatch;
        owners[index] = try ownership.logicalOwner(tree, groups, node);
    }
    return collectWithPolicy(a, section, id, owners, readable);
}

fn collectWithOwners(a: std.mem.Allocator, section: model.Section, id: u32, owners: ?[]const ?usize) ![]Span {
    return collectWithPolicy(a, section, id, owners, false);
}

fn collectWithPolicy(a: std.mem.Allocator, section: model.Section, id: u32, owners: ?[]const ?usize, readable: bool) ![]Span {
    if (id != 0 and id != controls.id("%hlk") and id != controls.id("%clk") and id != controls.id("%bmk") and id != controls.id("%xrf")) return error.UnsupportedSectionControl;
    if (owners) |values| if (values.len != section.paragraphs.len) return error.SourceBindingMismatch;
    const Open = struct { begin: Position, ordinal: usize, id: u32 };
    const State = struct { stack: [32]Open = undefined, depth: usize = 0 };
    var unbound: State = .{};
    var streams: std.AutoHashMapUnmanaged(usize, State) = .empty;
    defer streams.deinit(a);
    var out: std.ArrayList(Span) = .empty;
    errdefer out.deinit(a);
    for (section.paragraphs, 0..) |p, pi| {
        const state = if (owners) |values| blk: {
            const entry = try streams.getOrPut(a, values[pi] orelse std.math.maxInt(usize));
            if (!entry.found_existing) entry.value_ptr.* = .{};
            break :blk entry.value_ptr;
        } else &unbound;
        if (owners == null and state.depth != 0 and (p.parent_node != null or section.paragraphs[state.stack[0].begin.paragraph].parent_node != null)) return error.UnsupportedCrossParagraphField;
        var ordinal: usize = 0;
        for (p.tokens) |token| {
            if (token.kind != .control) continue;
            var tokens = (try Text.parse(token.raw)).tokens();
            const parsed = (try tokens.next()) orelse return error.SourceBindingMismatch;
            if (parsed.value != .control or try tokens.next() != null) return error.SourceBindingMismatch;
            const c = parsed.value.control;
            if (c.code == 3) {
                const started_id = std.mem.readInt(u32, c.data[0..4], .little);
                if (id == 0) {
                    if (readable) {
                        if (!@import("../body/field_start.zig").supports(started_id)) return error.UnsupportedSectionControl;
                    } else if (!supportsMixedEditableKind(started_id)) return error.UnsupportedSectionControl;
                } else if (started_id != id) return error.UnsupportedSectionControl;
                if (state.depth == state.stack.len) return error.LimitExceeded;
                const unit = std.math.add(u32, token.start_unit, std.math.cast(u32, token.raw.len / 2) orelse return error.LimitExceeded) catch return error.LimitExceeded;
                state.stack[state.depth] = .{ .begin = .{ .paragraph = pi, .unit = unit }, .ordinal = ordinal, .id = started_id };
                ordinal += 1;
                state.depth += 1;
            } else if (c.code == 4) {
                if (state.depth == 0) return error.UnsupportedCrossParagraphField;
                const end_id = std.mem.readInt(u32, c.data[0..4], .little);
                if (!@import("../body/field_end_identity.zig").matches(state.stack[state.depth - 1].id, end_id)) return error.FieldMarkerMismatch;
                state.depth -= 1;
                try out.append(a, .{ .begin = state.stack[state.depth].begin, .end = .{ .paragraph = pi, .unit = token.start_unit }, .ordinal = state.stack[state.depth].ordinal, .field_id = state.stack[state.depth].id });
            }
        }
    }
    if (unbound.depth != 0) return error.UnsupportedCrossParagraphField;
    var states = streams.valueIterator();
    while (states.next()) |state| if (state.depth != 0) return error.UnsupportedCrossParagraphField;
    return out.toOwnedSlice(a);
}

fn readableAllocationCase(a: std.mem.Allocator, section: model.Section) !void {
    const rows = try collectWithPolicy(a, section, 0, null, true);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
}

test "readable field ranges accept every known field kind without widening transaction spans" {
    const a = std.testing.allocator;
    var begin = [_]u8{ 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    var end = [_]u8{ 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0 };
    var tokens = [_]model.Token{
        .{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &begin },
        .{ .start_unit = 8, .kind = .control, .encoding = .utf16le, .raw = &end },
    };
    var paragraphs = [_]model.Paragraph{paragraph(&tokens)};
    const section: model.Section = .{ .paragraphs = &paragraphs, .source_record_count = 0 };
    for (controls.rules) |rule| {
        if (rule.code != 3) continue;
        std.mem.writeInt(u32, begin[2..6], rule.control_id, .little);
        std.mem.writeInt(u32, end[2..6], rule.control_id & 0x00ffffff, .little);
        const rows = try collectWithPolicy(a, section, 0, null, true);
        defer a.free(rows);
        try std.testing.expectEqual(@as(usize, 1), rows.len);
        try std.testing.expectEqual(rule.control_id, rows[0].field_id);
        try std.testing.expectEqual(rows[0].begin, rows[0].end);
        const editable = rule.control_id == controls.id("%hlk") or rule.control_id == controls.id("%clk") or rule.control_id == controls.id("%bmk") or rule.control_id == controls.id("%xrf") or rule.control_id == controls.id("%fmu");
        if (!editable) try std.testing.expectError(error.UnsupportedSectionControl, collectWithOwners(a, section, 0, null));
    }
    std.mem.writeInt(u32, begin[2..6], controls.id("%sig"), .little);
    std.mem.writeInt(u32, end[2..6], controls.id("%sig") & 0x00ffffff, .little);
    try @import("../../testing/allocation_failures.zig").check(readableAllocationCase, .{section});
    end[2] ^= 1;
    try std.testing.expectError(error.FieldMarkerMismatch, collectWithPolicy(a, section, 0, null, true));
    for ([_]u32{ controls.id("secd"), controls.id("zzzz") }) |id| {
        std.mem.writeInt(u32, begin[2..6], id, .little);
        try std.testing.expectError(error.UnsupportedSectionControl, collectWithPolicy(a, section, 0, null, true));
    }
}

fn allocationCase(a: std.mem.Allocator) !void {
    var start = [_]u8{ 3, 0, 'k', 'l', 'c', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    var end = [_]u8{ 4, 0, 'k', 'l', 'c', 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0 };
    var first = [_]model.Token{.{ .start_unit = 2, .kind = .control, .encoding = .utf16le, .raw = &start }};
    var last = [_]model.Token{.{ .start_unit = 4, .kind = .control, .encoding = .utf16le, .raw = &end }};
    var ps = [_]model.Paragraph{ paragraph(&first), paragraph(&last) };
    const section = model.Section{ .paragraphs = &ps, .source_record_count = 0 };
    const spans = try collect(a, section, controls.id("%clk"));
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 1), spans.len);
    try std.testing.expectEqual(Position{ .paragraph = 0, .unit = 10 }, spans[0].begin);
    try std.testing.expectEqual(Position{ .paragraph = 1, .unit = 4 }, spans[0].end);
    ps[1].parent_node = 42;
    try std.testing.expectError(error.UnsupportedCrossParagraphField, collect(a, section, controls.id("%clk")));
    ps[0].parent_node = 42;
    const same = try collectWithOwners(a, section, controls.id("%clk"), &.{ 17, 17 });
    defer a.free(same);
    try std.testing.expectEqual(@as(usize, 1), same.len);
    try expectOwnedError(a, section, &.{ 17, 18 }, error.UnsupportedCrossParagraphField);
    try expectOwnedError(a, section, &.{ 17, null }, error.UnsupportedCrossParagraphField);
    try std.testing.expectError(error.SourceBindingMismatch, collectWithOwners(a, section, controls.id("%clk"), &.{17}));
    ps[0].parent_node = null;
    ps[1].parent_node = null;
    end[2] = 'x';
    try std.testing.expectError(error.FieldMarkerMismatch, collect(a, section, controls.id("%clk")));
    end[2] = 'k';
    first[0].start_unit = std.math.maxInt(u32);
    try std.testing.expectError(error.LimitExceeded, collect(a, section, controls.id("%clk")));
    first[0].start_unit = 2;
    try std.testing.expectError(error.UnsupportedSectionControl, collect(a, section, controls.id("%hlk")));
}

fn paragraph(tokens: []model.Token) model.Paragraph {
    return .{ .source_node = 0, .parent_node = null, .declared_units = 0, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = tokens, .character_runs = &.{}, .deferred_direct_records = 0 };
}

test "click field spans validate root ownership identity overflow and allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
}

fn independentStreamsCase(a: std.mem.Allocator) !void {
    var start = [_]u8{ 3, 0, 'k', 'l', 'c', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    var end = [_]u8{ 4, 0, 'k', 'l', 'c', 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0 };
    var first = [_]model.Token{.{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &start }};
    var last = [_]model.Token{.{ .start_unit = 9, .kind = .control, .encoding = .utf16le, .raw = &end }};
    var ps = [_]model.Paragraph{ paragraph(&first), paragraph(&first), paragraph(&last), paragraph(&last) };
    ps[1].parent_node = 42;
    ps[3].parent_node = 42;
    const section = model.Section{ .paragraphs = &ps, .source_record_count = 0 };
    const spans = try collectWithOwners(a, section, controls.id("%clk"), &.{ null, 17, null, 17 });
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    try std.testing.expectEqual(@as(usize, 0), spans[0].begin.paragraph);
    try std.testing.expectEqual(@as(usize, 2), spans[0].end.paragraph);
    try std.testing.expectEqual(@as(usize, 1), spans[1].begin.paragraph);
    try std.testing.expectEqual(@as(usize, 3), spans[1].end.paragraph);
    try expectOwnedError(a, section, &.{ null, 17, null, 18 }, error.UnsupportedCrossParagraphField);
}

fn expectOwnedError(a: std.mem.Allocator, section: model.Section, owners: []const ?usize, expected: anyerror) !void {
    return expectScanError(a, section, controls.id("%clk"), owners, expected);
}

fn expectScanError(a: std.mem.Allocator, section: model.Section, id: u32, owners: []const ?usize, expected: anyerror) !void {
    const spans = collectWithOwners(a, section, id, owners) catch |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(expected, err);
        return;
    };
    a.free(spans);
    return error.TestExpectedError;
}

test "bound field spans keep interleaved root and nested ownership streams independent" {
    try @import("../../testing/allocation_failures.zig").check(independentStreamsCase, .{});
}

test "bound field spans use actual source identities and reject forged model parent" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const spans = try collectBound(a, bytes, source.header.version(), doc.sections[0], controls.id("%hlk"));
    defer a.free(spans);
    const plain = try collect(a, doc.sections[0], controls.id("%hlk"));
    defer a.free(plain);
    try std.testing.expectEqualDeep(plain, spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    try std.testing.checkAllAllocationFailures(a, boundAllocationCase, .{ bytes, source.header.version(), doc.sections[0] });
    doc.sections[0].paragraphs[0].parent_node = 42;
    try std.testing.expectError(error.SourceBindingMismatch, collectBound(a, bytes, source.header.version(), doc.sections[0], controls.id("%hlk")));
}

fn boundAllocationCase(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, section: model.Section) !void {
    const spans = try collectBound(a, bytes, version, section, controls.id("%hlk"));
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
}

fn mixedMarkersCase(a: std.mem.Allocator) !void {
    var clk = [_]u8{ 3, 0, 'k', 'l', 'c', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    var fmu = clk;
    std.mem.writeInt(u32, fmu[2..6], controls.id("%fmu"), .little);
    var fmu_end = fmu;
    std.mem.writeInt(u16, fmu_end[0..2], 4, .little);
    std.mem.writeInt(u16, fmu_end[14..16], 4, .little);
    std.mem.writeInt(u32, fmu_end[2..6], 0x08666d75, .little);
    var clk_end = clk;
    std.mem.writeInt(u16, clk_end[0..2], 4, .little);
    std.mem.writeInt(u16, clk_end[14..16], 4, .little);
    std.mem.writeInt(u32, clk_end[2..6], 0x09636c6b, .little);
    var tokens = [_]model.Token{
        .{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &clk },
        .{ .start_unit = 8, .kind = .control, .encoding = .utf16le, .raw = &fmu },
        .{ .start_unit = 16, .kind = .control, .encoding = .utf16le, .raw = &fmu_end },
        .{ .start_unit = 24, .kind = .control, .encoding = .utf16le, .raw = &clk_end },
    };
    var ps = [_]model.Paragraph{paragraph(&tokens)};
    const section = model.Section{ .paragraphs = &ps, .source_record_count = 0 };
    const spans = try collectWithOwners(a, section, 0, &.{null});
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    try std.testing.expectEqual(controls.id("%fmu"), spans[0].field_id);
    try std.testing.expectEqual(@as(usize, 1), spans[0].ordinal);
    try std.testing.expectEqual(controls.id("%clk"), spans[1].field_id);
    try std.testing.expectEqual(@as(usize, 0), spans[1].ordinal);
    fmu_end[5] = 9;
    try expectScanError(a, section, 0, &.{null}, error.FieldMarkerMismatch);
    fmu_end[5] = 8;
    std.mem.writeInt(u32, clk[2..6], controls.id("%xrf"), .little);
    try expectScanError(a, section, 0, &.{null}, error.FieldMarkerMismatch);
    std.mem.writeInt(u32, clk[2..6], controls.id("%zzz"), .little);
    try expectScanError(a, section, 0, &.{null}, error.UnsupportedSectionControl);
    std.mem.writeInt(u32, clk[2..6], controls.id("%clk"), .little);
    ps[0].tokens = tokens[0..3];
    try expectScanError(a, section, 0, &.{null}, error.UnsupportedCrossParagraphField);
}

test "mixed field spans preserve kind and shared paragraph ordinal with allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(mixedMarkersCase, .{});
}

test "reference mixed field spans bind distribution click and formula without edit permission" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1768/distribution_doc.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const spans = try collectMixedBound(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    var clicks: usize = 0;
    var formulas: usize = 0;
    for (spans) |span| {
        clicks += @intFromBool(span.field_id == controls.id("%clk"));
        formulas += @intFromBool(span.field_id == controls.id("%fmu"));
    }
    try std.testing.expectEqual(@as(usize, 1), clicks);
    try std.testing.expectEqual(@as(usize, 1), formulas);
}

test "reference click field spans bind every observed regulatory analysis marker" {
    const a = std.testing.allocator;
    const cases = .{
        .{ "reference/rhwp/samples/issue1891/76076_regulatory_analysis.hwpx", @as(usize, 125) },
        .{ "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", @as(usize, 49) },
    };
    inline for (cases) |case| {
        const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(16_000_000)) catch |err| switch (err) {
            error.FileNotFound => return error.SkipZigTest,
            else => return err,
        };
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer doc.deinit(a);
        const spans = try collectBound(a, bytes, source.header.version(), doc.sections[0], controls.id("%clk"));
        defer a.free(spans);
        try std.testing.expectEqual(case[1], spans.len);
    }
}
