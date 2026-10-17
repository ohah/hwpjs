//! Atomic mixed field text, modified attributes and supported formula recalculation.
const std = @import("std");
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");
const Version = @import("../version.zig").Version;
const Context = struct {
    source: []const u8,
    version: Version,
    edit: plain.Splice,
    char_count: usize,
    original: *const model.Section,
    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        const bound = try @import("field_bindings.zig").collect(a, self.source, self.version, self.original.*);
        defer a.free(bound);
        const before = try plain.textBytes(a, draft.paragraphs[self.edit.paragraph]);
        defer a.free(before);
        try plain.applyFieldTransaction(a, self.source, self.version, &draft.paragraphs[self.edit.paragraph], self.edit, self.char_count);
        const after = try plain.textBytes(a, draft.paragraphs[self.edit.paragraph]);
        defer a.free(after);
        if (std.mem.eql(u8, before, after)) return;
        const formulas = try @import("field_result_protection.zig").validate(a, self.source, self.version, self.original.*, bound, self.edit);
        const handled = try a.alloc(bool, draft.paragraphs.len);
        defer a.free(handled);
        @memset(handled, false);
        for (bound) |binding| {
            if (@import("field_result_protection.zig").isDerivedResult(binding.span.field_id)) continue;
            if (self.edit.paragraph < binding.span.begin.paragraph or self.edit.paragraph > binding.span.end.paragraph) continue;
            const owner = binding.span.begin.paragraph;
            if (handled[owner]) continue;
            handled[owner] = true;
            const values = try @import("field_dirty_values.zig").prepare(a, self.source, self.version, self.original.*, owner, .{ .paragraph = self.edit.paragraph, .start = self.edit.start_unit, .end = self.edit.end_unit });
            if (draft.paragraphs[owner].field_attributes) |previous| a.free(previous);
            draft.paragraphs[owner].field_attributes = values;
        }
        if (formulas) _ = try @import("formula_recalculate.zig").applyDraftForParagraph(a, self.source, self.version, draft, self.char_count, .{}, self.edit.paragraph);
        var names = false;
        for (bound) |binding| names = names or binding.span.field_id == @import("../body/control_rules.zig").id("%xrf");
        if (names) {
            const sites = try @import("cross_reference_bookmark_sites.zig").collect(a, self.source, self.version, self.edit.section);
            defer a.free(sites);
            _ = try @import("cross_reference_name_apply.zig").applyDraftRetainingObjectNumbers(a, self.source, self.version, draft, sites, self.char_count);
        }
        const verified = try @import("field_bindings.zig").collect(a, self.source, self.version, draft.*);
        a.free(verified);
    }
};

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, edit: plain.Splice, char_count: usize) !void {
    if (edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .edit = edit, .char_count = char_count, .original = section }, Context.prepare);
}

test "reference click field transaction changes text and serializes section for reopening" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
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
    const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    const selected = bound[0].span.begin;
    const before = try plain.textBytes(a, doc.sections[0].paragraphs[selected.paragraph]);
    defer a.free(before);
    try apply(a, bytes, source.header.version(), &doc.sections[0], .{ .section = 0, .paragraph = selected.paragraph, .start_unit = selected.unit, .end_unit = selected.unit, .utf8 = "검증" }, 65536);
    const after = try plain.textBytes(a, doc.sections[0].paragraphs[selected.paragraph]);
    defer a.free(after);
    try std.testing.expect(!std.mem.eql(u8, before, after));
    const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    var reopened = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{saved});
    defer reopened.deinit(a);
    const recovered = try plain.textBytes(a, reopened.sections[0].paragraphs[selected.paragraph]);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, after, recovered);
}

test "field transaction allocation failures preserve original text and attributes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ bytes, source.header.version() });
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8, version: Version) !void {
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{bytes});
    defer doc.deinit(a);
    const stable = std.testing.allocator;
    const before = try plain.textBytes(stable, doc.sections[0].paragraphs[2]);
    defer stable.free(before);
    apply(a, bytes, version, &doc.sections[0], .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .utf8 = "검증" }, 65536) catch |err| {
        const current = try plain.textBytes(stable, doc.sections[0].paragraphs[2]);
        defer stable.free(current);
        try std.testing.expectEqualSlices(u8, before, current);
        for (doc.sections[0].paragraphs) |p| try std.testing.expect(p.field_attributes == null);
        return err;
    };
    try std.testing.expect(doc.sections[0].paragraphs[1].field_attributes != null);
}

test "mixed field transaction preserves formula result protection and existing chart recalculation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    const span = bound[0].span;
    try std.testing.expectError(error.ReadOnlyFormulaResult, apply(a, bytes, source.header.version(), &doc.sections[0], .{ .section = 0, .paragraph = span.begin.paragraph, .start_unit = span.begin.unit, .end_unit = span.begin.unit, .utf8 = "검증" }, 65536));
    const unchanged = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    var expected = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer expected.deinit(a);
    const edit: plain.Splice = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "2" };
    try apply(a, bytes, source.header.version(), &doc.sections[0], edit, 65536);
    try @import("formula_splice.zig").apply(a, bytes, source.header.version(), &expected.sections[0], edit, 65536);
    const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    const oracle = try @import("text_section_writer.zig").write(a, bytes, expected.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(oracle);
    try std.testing.expectEqualSlices(u8, oracle, saved);
}

test "reference mixed click formula field transaction preserves decoded distribution section" {
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
    try apply(a, bytes, source.header.version(), &doc.sections[0], .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "검증" }, 65536);
    const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    try std.testing.expect(!std.mem.eql(u8, bytes, saved));
    var reopened = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{saved});
    defer reopened.deinit(a);
    const actual = try plain.textBytes(a, doc.sections[0].paragraphs[0]);
    defer a.free(actual);
    const recovered = try plain.textBytes(a, reopened.sections[0].paragraphs[0]);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, actual, recovered);
}
