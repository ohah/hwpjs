const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const xml_values = @import("xml_values.zig");

pub const Options = struct {
    max_attribute_bytes: usize = 4096,
    max_paragraphs: usize = 2_000_000,
    xml: document_xml.Options = .{},
};

pub const BooleanCounts = struct {
    absent: usize = 0,
    false_value: usize = 0,
    true_value: usize = 0,
};

pub const Report = struct {
    sections: usize = 0,
    paragraphs: usize = 0,
    missing_id: usize = 0,
    zero_id: usize = 0,
    missing_para_tc_id: usize = 0,
    page_break: BooleanCounts = .{},
    column_break: BooleanCounts = .{},
    merged: BooleanCounts = .{},
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    report: *Report,

    fn value(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8) !?[]u8 {
        return attrs.attribute(self.allocator, tag, scope, name, self.options.max_attribute_bytes);
    }

    fn noteBoolean(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8, counts: *BooleanCounts) !void {
        const raw = try self.value(tag, scope, name);
        defer if (raw) |v| self.allocator.free(v);
        if (raw) |v| {
            if (try xml_values.boolean(v)) counts.true_value += 1 else counts.false_value += 1;
        } else counts.absent += 1;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, _: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end or !try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) return;
        if (self.report.paragraphs == self.options.max_paragraphs) return error.LimitExceeded;
        self.report.paragraphs += 1;
        const id = try self.value(tag, scope, "id");
        defer if (id) |v| self.allocator.free(v);
        if (id) |v| {
            if (try xml_values.nonNegative(v)) self.report.zero_id += 1;
        } else self.report.missing_id += 1;
        const tc_id = try self.value(tag, scope, "paraTcId");
        defer if (tc_id) |v| self.allocator.free(v);
        if (tc_id) |v| {
            _ = try xml_values.nonNegative(v);
        } else self.report.missing_para_tc_id += 1;
        try self.noteBoolean(tag, scope, "pageBreak", &self.report.page_break);
        try self.noteBoolean(tag, scope, "columnBreak", &self.report.column_break);
        try self.noteBoolean(tag, scope, "merged", &self.report.merged);
    }
};

/// Validates the scalar PType attributes of all selected section trees. The
/// caller retains the exact XML; missing paragraph IDs are reported, not
/// rejected, because Hancom's public guidance conflicts with the XSD sample.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        var context: Context = .{ .allocator = a, .options = options, .report = &report };
        _ = try document_xml.visitBytes(a, section.source, section.source.len, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        report.sections += 1;
    }
    return report;
}
