//! Source-backed mixed field header bindings. No mutation or command execution.
const std = @import("std");
const model = @import("../../model/document.zig");
const spans = @import("local_field_spans.zig");
const headers = @import("field_header_source.zig");
const start = @import("../body/field_start.zig");
pub const Binding = struct {
    span: spans.Span,
    source_node: u32,
    /// Command and extension slices borrow the supplied decoded section.
    properties: start.Properties,
};

pub fn collect(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) ![]Binding {
    return collectWithPolicy(a, source, version, section, false);
}

/// All known field kinds for read-only coordinates, never transaction admission.
pub fn collectReadable(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) ![]Binding {
    return collectWithPolicy(a, source, version, section, true);
}

fn collectWithPolicy(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, readable: bool) ![]Binding {
    const found = if (readable) try spans.collectReadableBound(a, source, version, section) else try spans.collectMixedBound(a, source, version, section);
    defer a.free(found);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const counts = try a.alloc(usize, section.paragraphs.len);
    defer a.free(counts);
    @memset(counts, 0);
    for (found) |span| counts[span.begin.paragraph] += 1;
    for (section.paragraphs, counts) |paragraph, expected| {
        if (paragraph.source_node == null) {
            if (expected != 0) return error.SourceBindingMismatch;
            continue;
        }
        const owner = try paragraph.originalNode();
        const actual = try headers.count(tree, owner);
        if (actual != expected) return error.SourceBindingMismatch;
    }
    const result = try a.alloc(Binding, found.len);
    errdefer a.free(result);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (found, result) |span, *binding| {
        const paragraph = section.paragraphs[span.begin.paragraph];
        const owner = try paragraph.originalNode();
        const header = try headers.read(tree, owner, span.ordinal, span.field_id, readable);
        const entry = try seen.getOrPut(a, header.source_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        binding.* = .{ .span = span, .source_node = header.source_node, .properties = header.properties };
    }
    return result;
}

test "field bindings preserve actual command bytes and reject forged field kind" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bound = try collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    try std.testing.expectEqual(@as(usize, 2), bound.len);
    try std.testing.expect(bound[0].properties.command.len != 0);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ bytes, source.header.version(), doc.sections[0] });
    // Current markers must not bind an original header of a different kind.
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const offset = @intFromPtr(tree.nodes[bound[0].source_node].record.framing.payload.ptr) - @intFromPtr(bytes.ptr);
    const changed = try a.dupe(u8, bytes);
    defer a.free(changed);
    std.mem.writeInt(u32, changed[offset..][0..4], @import("../body/control_rules.zig").id("%clk"), .little);
    try std.testing.expectError(error.FieldMarkerMismatch, collect(a, changed, source.header.version(), doc.sections[0]));
    var duplicate = [_]model.Paragraph{ doc.sections[0].paragraphs[0], doc.sections[0].paragraphs[0] };
    const duplicate_section = model.Section{ .paragraphs = &duplicate, .source_record_count = doc.sections[0].source_record_count };
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, bytes, source.header.version(), duplicate_section));
    const original_tokens = doc.sections[0].paragraphs[0].tokens;
    var retained: std.ArrayList(model.Token) = .empty;
    defer retained.deinit(a);
    for (original_tokens) |token| {
        const field_marker = token.kind == .control and token.raw.len == 16 and (std.mem.readInt(u16, token.raw[0..2], .little) == 3 or std.mem.readInt(u16, token.raw[0..2], .little) == 4);
        if (!field_marker) try retained.append(a, token);
    }
    doc.sections[0].paragraphs[0].tokens = retained.items;
    defer doc.sections[0].paragraphs[0].tokens = original_tokens;
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, bytes, source.header.version(), doc.sections[0]));
}

fn allocationCase(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) !void {
    const bound = try collect(a, source, version, section);
    defer a.free(bound);
    try std.testing.expectEqual(@as(usize, 2), bound.len);
}

test "reference field bindings resolve every click and mixed distribution header" {
    const a = std.testing.allocator;
    const cases = .{
        .{ "reference/rhwp/samples/issue1891/76076_regulatory_analysis.hwpx", @as(usize, 125) },
        .{ "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", @as(usize, 49) },
        .{ "reference/rhwp/samples/task1768/distribution_doc.hwpx", @as(usize, 2) },
        .{ "reference/rhwp/samples/추진일정.hwp", @as(usize, 1) },
    };
    inline for (cases) |case| {
        const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(16_000_000)) catch |err| switch (err) {
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
        const bound = try collect(a, bytes, source.header.version(), doc.sections[0]);
        defer a.free(bound);
        try std.testing.expectEqual(case[1], bound.len);
    }
}
