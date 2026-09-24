const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const masterpage_parts = @import("masterpage_parts.zig");

pub const ChildClass = enum(u8) { model, bookmark, switch_element, other_paragraph, foreign };
pub const Location = struct {
    item_index: usize,
    run_ordinal: usize,
};

pub const Options = struct {
    max_runs: usize = 4_000_000,
    xml: document_xml.Options = .{},
};

pub const MasterOptions = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    scan: Options = .{},
};

/// Diagnostic topology only. No 2021-schema child/order rule is imposed on
/// 2011 XML; observed extensions and late secPr values are not discarded.
pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    runs: usize = 0,
    non_direct_runs: usize = 0,
    direct_children: usize = 0,
    child_classes: [5]usize = @splat(0),
    sec_pr_children: usize = 0,
    duplicate_sec_pr_runs: usize = 0,
    late_sec_pr_runs: usize = 0,
    xml_bytes: usize = 0,
    first_non_direct_run: ?Location = null,
    first_duplicate_sec_pr: ?Location = null,
    first_late_sec_pr: ?Location = null,
    first_unmodeled_child: ?Location = null,

    pub fn childCount(self: *const Report, kind: ChildClass) usize {
        return self.child_classes[@intFromEnum(kind)];
    }
};

// Direct children registered by Hancom's public RunType model. This is a
// classification aid, not an exhaustive 2011 XML allow-list.
const model_names = [_][]const u8{
    "secPr",     "ctrl",   "t",            "tbl",        "pic",      "ole",        "container",   "equation",
    "line",      "rect",   "ellipse",      "arc",        "polygon",  "curve",      "connectLine", "textart",
    "compose",   "dutmal", "btn",          "radioBtn",   "checkBtn", "comboBox",   "listBox",     "edit",
    "scrollBar", "video",  "markpenBegin", "markpenEnd", "chart",    "unknownObj",
};

fn classify(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !ChildClass {
    const name = try scope.expandElement(tag.name);
    if (!std.mem.eql(u8, name.uri, document_xml.paragraph_uri)) return .foreign;
    if (name.local.equals("bookmark", false)) return .bookmark;
    if (name.local.equals("switch", false)) return .switch_element;
    for (model_names) |candidate| if (name.local.equals(candidate, false)) return .model;
    return .other_paragraph;
}

const Mode = enum { section, master_page };
const Node = struct {
    kind: enum { other, paragraph, run } = .other,
    in_scope: bool = false,
    direct_children: usize = 0,
    sec_pr_children: usize = 0,
    run_ordinal: usize = 0,
};

const Scanner = struct {
    a: std.mem.Allocator,
    mode: Mode,
    options: Options,
    item_index: usize,
    report: *Report,
    nodes: std.ArrayList(Node) = .empty,
    sub_lists: usize = 0,
    runs_in_part: usize = 0,

    fn deinit(self: *Scanner) void {
        self.nodes.deinit(self.a);
    }

    fn location(self: *const Scanner, run_ordinal: usize) Location {
        return .{ .item_index = self.item_index, .run_ordinal = run_ordinal };
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth != self.nodes.items.len) return error.InvalidRunTopologyDepth;
            _ = self.nodes.pop();
            return;
        }
        if (depth != self.nodes.items.len + 1) return error.InvalidRunTopologyDepth;
        const parent: Node = if (depth == 1) .{} else self.nodes.items[depth - 2];
        var node: Node = .{ .in_scope = if (self.mode == .section) true else parent.in_scope };
        if (depth == 1) {
            const valid_root = switch (self.mode) {
                .section => try attrs.element(tag, scope, document_xml.section_uri, "sec"),
                .master_page => try attrs.element(tag, scope, "", "masterPage"),
            };
            if (!valid_root) return error.InvalidRunTopologyRoot;
        } else if (self.mode == .master_page and depth == 2) {
            node.in_scope = try attrs.element(tag, scope, document_xml.paragraph_uri, "subList");
            if (node.in_scope) self.sub_lists += 1;
        }
        if (parent.in_scope and parent.kind == .run) {
            const parent_node = &self.nodes.items[depth - 2];
            const child_class = try classify(tag, scope);
            self.report.direct_children += 1;
            self.report.child_classes[@intFromEnum(child_class)] += 1;
            if (child_class != .model and self.report.first_unmodeled_child == null) self.report.first_unmodeled_child = self.location(parent.run_ordinal);
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "secPr")) {
                self.report.sec_pr_children += 1;
                if (parent_node.sec_pr_children == 0 and parent_node.direct_children != 0) {
                    self.report.late_sec_pr_runs += 1;
                    if (self.report.first_late_sec_pr == null) self.report.first_late_sec_pr = self.location(parent.run_ordinal);
                }
                if (parent_node.sec_pr_children == 1) {
                    self.report.duplicate_sec_pr_runs += 1;
                    if (self.report.first_duplicate_sec_pr == null) self.report.first_duplicate_sec_pr = self.location(parent.run_ordinal);
                }
                parent_node.sec_pr_children += 1;
            }
            parent_node.direct_children += 1;
        }
        if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            node.kind = .paragraph;
        } else if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) {
            if (self.report.runs == self.options.max_runs) return error.LimitExceeded;
            self.report.runs += 1;
            self.runs_in_part += 1;
            node.kind = .run;
            node.run_ordinal = self.runs_in_part;
            if (parent.kind != .paragraph) {
                self.report.non_direct_runs += 1;
                if (self.report.first_non_direct_run == null) self.report.first_non_direct_run = self.location(node.run_ordinal);
            }
        }
        if (tag.kind == .start) try self.nodes.append(self.a, node);
    }
};

fn scan(a: std.mem.Allocator, bytes: []const u8, mode: Mode, item_index: usize, options: Options, report: *Report) !usize {
    var scanner: Scanner = .{ .a = a, .mode = mode, .options = options, .item_index = item_index, .report = report };
    defer scanner.deinit();
    _ = try document_xml.visitBytes(a, bytes, bytes.len, options.xml, .{ .context = &scanner, .on_tag = Scanner.onTag });
    if (scanner.nodes.items.len != 0) return error.InvalidRunTopologyDepth;
    report.parts += 1;
    report.sub_lists += scanner.sub_lists;
    report.xml_bytes = std.math.add(usize, report.xml_bytes, bytes.len) catch return error.LimitExceeded;
    return scanner.sub_lists;
}

pub fn inspectSections(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        _ = try scan(a, section.source, .section, section.item_index, options, &report);
    }
    return report;
}

pub fn inspectMasterPages(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, options: MasterOptions) !Report {
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var report: Report = .{};
    var remaining = options.max_total_xml_bytes;
    for (parts) |part| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const bytes = try archive.decode(archive.entries[part.entry_index], @min(options.max_part_xml_bytes, remaining));
        defer archive.allocator.free(bytes);
        const sub_lists = try scan(a, bytes, .master_page, part.item_index, options.scan, &report);
        if (sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        remaining -= bytes.len;
    }
    return report;
}
