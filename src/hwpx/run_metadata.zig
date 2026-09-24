const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const values = @import("xml_values.zig");

pub const Options = struct {
    max_attribute_bytes: usize = 4096,
    max_runs: usize = 4_000_000,
    xml: document_xml.Options = .{},
};

/// Raw RunType track-change attribute census. A legacy paraTcId is not
/// silently substituted for charTcId, and conflicting explicit values remain
/// observable rather than choosing a version heuristic.
pub const Report = struct {
    sections: usize = 0,
    runs: usize = 0,
    missing_char_tc_id: usize = 0,
    zero_char_tc_id: usize = 0,
    para_tc_alias_present: usize = 0,
    para_tc_alias_only: usize = 0,
    equal_dual_ids: usize = 0,
    conflicting_dual_ids: usize = 0,
};

/// Shared field validation for any selected 2011 hp:run. Element selection
/// and the run budget belong to the caller.
pub fn noteTag(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, report: *Report) !void {
    const raw_char = try attrs.attribute(a, tag, scope, "charTcId", max_attribute_bytes);
    defer if (raw_char) |value| a.free(value);
    const raw_para = try attrs.attribute(a, tag, scope, "paraTcId", max_attribute_bytes);
    defer if (raw_para) |value| a.free(value);
    const char_id: ?u32 = if (raw_char) |value| try values.unsigned32(value) else null;
    const para_id: ?u32 = if (raw_para) |value| try values.unsigned32(value) else null;
    report.runs += 1;
    if (char_id) |id| {
        report.zero_char_tc_id += @intFromBool(id == 0);
    } else report.missing_char_tc_id += 1;
    if (para_id) |id| {
        report.para_tc_alias_present += 1;
        if (char_id) |primary| {
            if (primary == id) report.equal_dual_ids += 1 else report.conflicting_dual_ids += 1;
        } else report.para_tc_alias_only += 1;
    }
}

const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    report: *Report,

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, _: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end or !try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) return;
        if (self.report.runs == self.options.max_runs) return error.LimitExceeded;
        try noteTag(self.a, tag, scope, self.options.max_attribute_bytes, self.report);
    }
};

pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        var context: Context = .{ .a = a, .options = options, .report = &report };
        _ = try document_xml.visitBytes(a, section.source, section.source.len, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        report.sections += 1;
    }
    return report;
}
