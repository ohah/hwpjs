const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const text_child_names = @import("text_child_names.zig");
const tab_attributes = @import("tab_attributes.zig");

pub const ChildClass = enum(u8) { model, xsd_hyphen, other_paragraph, foreign };
pub const Location = struct { item_index: usize, text_ordinal: usize };

pub const Options = struct {
    max_text_nodes: usize = 4_000_000,
    max_tabs: usize = 2_000_000,
    max_attribute_bytes: usize = 4096,
    xml: document_xml.Options = .{},
};

pub const MasterOptions = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    scan: Options = .{},
};

/// Raw 2011 hp:t shape; it is not a rendered text or schema-validity claim.
pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    text_nodes: usize = 0,
    non_direct_text_nodes: usize = 0,
    missing_char_style_id_ref: usize = 0,
    zero_char_style_id_ref: usize = 0,
    over_u32_char_style_id_ref: usize = 0,
    direct_children: usize = 0,
    child_classes: [4]usize = @splat(0),
    tab: tab_attributes.Report = .{},
    xml_bytes: usize = 0,
    first_non_direct_text: ?Location = null,
    first_unmodeled_child: ?Location = null,

    pub fn childCount(self: *const Report, kind: ChildClass) usize {
        return self.child_classes[@intFromEnum(kind)];
    }
};

const Classified = struct { class: ChildClass, model: ?text_child_names.ModelKind = null };

fn classify(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !Classified {
    if (try text_child_names.modelKind(tag, scope)) |kind| return .{ .class = .model, .model = kind };
    const name = try scope.expandElement(tag.name);
    if (!std.mem.eql(u8, name.uri, document_xml.paragraph_uri)) return .{ .class = .foreign };
    if (name.local.equals("hyphen", false)) return .{ .class = .xsd_hyphen };
    return .{ .class = .other_paragraph };
}

const Mode = enum { section, master_page };
const Node = struct {
    kind: enum { other, run, text } = .other,
    in_scope: bool = false,
    text_ordinal: usize = 0,
};

const Scanner = struct {
    a: std.mem.Allocator,
    mode: Mode,
    options: Options,
    item_index: usize,
    report: *Report,
    nodes: std.ArrayList(Node) = .empty,
    sub_lists: usize = 0,
    text_nodes_in_part: usize = 0,

    fn deinit(self: *Scanner) void {
        self.nodes.deinit(self.a);
    }

    fn location(self: *const Scanner, ordinal: usize) Location {
        return .{ .item_index = self.item_index, .text_ordinal = ordinal };
    }

    fn noteCharStyle(self: *Scanner, tag: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
        const raw = try attrs.attribute(self.a, tag, scope, "charStyleIDRef", self.options.max_attribute_bytes);
        defer if (raw) |value| self.a.free(value);
        if (raw) |value| {
            const zero = try values.nonNegative(value);
            self.report.zero_char_style_id_ref += @intFromBool(zero);
            if (!zero) {
                const trimmed = std.mem.trim(u8, value, " \t\r\n");
                const digits = if (trimmed[0] == '+') trimmed[1..] else trimmed;
                _ = std.fmt.parseInt(u32, digits, 10) catch {
                    self.report.over_u32_char_style_id_ref += 1;
                    return;
                };
            }
        } else self.report.missing_char_style_id_ref += 1;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth != self.nodes.items.len) return error.InvalidTextNodeDepth;
            _ = self.nodes.pop();
            return;
        }
        if (depth != self.nodes.items.len + 1) return error.InvalidTextNodeDepth;
        const parent: Node = if (depth == 1) .{} else self.nodes.items[depth - 2];
        var node: Node = .{ .in_scope = if (self.mode == .section) true else parent.in_scope };
        if (depth == 1) {
            const root_ok = switch (self.mode) {
                .section => try attrs.element(tag, scope, document_xml.section_uri, "sec"),
                .master_page => try attrs.element(tag, scope, "", "masterPage"),
            };
            if (!root_ok) return error.InvalidTextNodeRoot;
        } else if (self.mode == .master_page and depth == 2) {
            node.in_scope = try attrs.element(tag, scope, document_xml.paragraph_uri, "subList");
            if (node.in_scope) self.sub_lists += 1;
        }
        if (parent.in_scope and parent.kind == .text) {
            const classified = try classify(tag, scope);
            self.report.direct_children += 1;
            self.report.child_classes[@intFromEnum(classified.class)] += 1;
            if (classified.class != .model) {
                if (self.report.first_unmodeled_child == null) self.report.first_unmodeled_child = self.location(parent.text_ordinal);
            }
            if (classified.model == .tab) {
                if (self.report.tab.tabs == self.options.max_tabs) return error.LimitExceeded;
                try tab_attributes.noteTag(self.a, tag, scope, self.options.max_attribute_bytes, &self.report.tab);
            }
        }
        if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) {
            node.kind = .run;
        } else if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "t")) {
            if (self.report.text_nodes == self.options.max_text_nodes) return error.LimitExceeded;
            try self.noteCharStyle(tag, scope);
            self.report.text_nodes += 1;
            self.text_nodes_in_part += 1;
            node.kind = .text;
            node.text_ordinal = self.text_nodes_in_part;
            if (parent.kind != .run) {
                self.report.non_direct_text_nodes += 1;
                if (self.report.first_non_direct_text == null) self.report.first_non_direct_text = self.location(node.text_ordinal);
            }
        }
        if (tag.kind == .start) try self.nodes.append(self.a, node);
    }
};

fn scan(a: std.mem.Allocator, bytes: []const u8, mode: Mode, item_index: usize, options: Options, report: *Report) !usize {
    var scanner: Scanner = .{ .a = a, .mode = mode, .options = options, .item_index = item_index, .report = report };
    defer scanner.deinit();
    _ = try document_xml.visitBytes(a, bytes, bytes.len, options.xml, .{ .context = &scanner, .on_tag = Scanner.onTag });
    if (scanner.nodes.items.len != 0) return error.InvalidTextNodeDepth;
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
