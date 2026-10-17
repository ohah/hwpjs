//! Atomic name-result materialization. Caller supplies validated current sites.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const Site = @import("../body/cross_reference_name_target.zig").Site;
pub const Report = struct { processed: usize = 0, changed: usize = 0 };
const Context = struct {
    source: []const u8,
    version: Version,
    sites: []const Site,
    char_count: usize,
    report: *Report,
    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        self.report.* = try applyDraft(a, self.source, self.version, draft, self.sites, self.char_count);
    }
};
pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, sites: []const Site, char_count: usize) !Report {
    var report: Report = .{};
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .sites = sites, .char_count = char_count, .report = &report }, Context.prepare);
    return report;
}
/// Only for an enclosing section transaction that discards its whole draft on failure.
pub fn applyDraft(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, sites: []const Site, char_count: usize) !Report {
    return applyDraftWithRetention(a, source, version, section, sites, char_count, false);
}

/// Text splices preserve these derived labels and protect their spans instead
/// of interpreting a numeric target as a named bookmark.
pub fn applyDraftRetainingTableNumbers(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, sites: []const Site, char_count: usize) !Report {
    return applyDraftWithRetention(a, source, version, section, sites, char_count, true);
}

fn applyDraftWithRetention(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, sites: []const Site, char_count: usize, retain_table_numbers: bool) !Report {
    const bindings = try @import("field_bindings.zig").collect(a, source, version, section.*);
    defer a.free(bindings);
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var report: Report = .{};
    for (bindings) |binding| {
        if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
        const view = try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command);
        if (retain_table_numbers and try @import("cross_reference_format_retention.zig").tableNumber(view)) continue;
        const label = try @import("../body/cross_reference_name_result.zig").evaluate(view, sites);
        const current = try @import("field_bindings.zig").collect(a, source, version, section.*);
        defer a.free(current);
        const selected = for (current) |value| {
            if (value.source_node == binding.source_node) break value;
        } else return error.SourceBindingMismatch;
        const span = selected.span;
        if (span.begin.paragraph != span.end.paragraph) return error.UnsupportedCrossParagraphField;
        const p = &section.paragraphs[span.begin.paragraph];
        const parts = try @import("../body/paragraph_children.zig").collect(tree, try p.originalNode());
        try parts.metadata.validate(tree.nodes[try p.originalNode()].record.value.header, char_count);
        const before = try @import("plain_text_content.zig").textBytes(a, p.*);
        defer a.free(before);
        const after = try @import("field_display_bytes.zig").prepare(a, before, span.begin.unit, span.end.unit, label);
        defer a.free(after);
        try @import("derived_display_apply.zig").applyDraft(a, p, before, after, .{ .start_unit = span.begin.unit, .end_unit = span.end.unit, .added_units = @intCast(label.len / 2) }, parts.metadata.ranges, char_count);
        report.processed += 1;
        if (!std.mem.eql(u8, before, after)) report.changed += 1;
    }
    const verified = try @import("field_bindings.zig").collect(a, source, version, section.*);
    a.free(verified);
    return report;
}
