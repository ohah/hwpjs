const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const paragraph_children = @import("paragraph_children.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    scan: paragraph_children.Options = .{},
    xml: document_xml.Options = .{},
};

/// Root-direct master-page subLists only. Child classification and paragraph
/// diagnostics are owned by the section's paragraph_children.zig module.
pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    children: paragraph_children.Report = .{},
    xml_bytes: usize = 0,
};

const Node = struct {
    in_scope: bool = false,
    paragraph: bool = false,
    state: paragraph_children.ParagraphState = .{},
};

const Scanner = struct {
    a: std.mem.Allocator,
    options: Options,
    report: *Report,
    nodes: std.ArrayList(Node) = .empty,
    direct: *paragraph_children.ScanState,
    sub_lists: usize = 0,
    paragraphs: usize = 0,

    fn deinit(self: *Scanner) void {
        self.nodes.deinit(self.a);
    }

    fn finish(self: *Scanner, node: Node) void {
        if (node.paragraph) paragraph_children.finishParagraph(&self.report.children, node.state);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 0 or depth != self.nodes.items.len) return error.InvalidParagraphChildrenDepth;
            self.finish(self.nodes.pop().?);
            return;
        }
        if (depth != self.nodes.items.len + 1) return error.InvalidParagraphChildrenDepth;
        const parent: Node = if (depth == 1) .{} else self.nodes.items[depth - 2];
        var node: Node = .{ .in_scope = parent.in_scope };
        if (depth == 1) {
            if (!try masterpage_parts.isRootTag(tag, scope)) return error.InvalidMasterPageRoot;
        } else if (depth == 2) {
            node.in_scope = try masterpage_parts.isDirectSubListTag(tag, scope);
            self.sub_lists += @intFromBool(node.in_scope);
        }
        if (parent.in_scope and parent.paragraph) {
            const name = try scope.expandElement(tag.name);
            try paragraph_children.noteDirectChild(name, &self.report.children, self.options.scan, self.direct, &self.nodes.items[depth - 2].state);
        }
        if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            try paragraph_children.noteParagraph(&self.report.children, self.options.scan);
            self.paragraphs += 1;
            node.paragraph = true;
        }
        if (tag.kind == .start) try self.nodes.append(self.a, node) else self.finish(node);
    }
};

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, options: Options) !Report {
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var report: Report = .{};
    var direct: paragraph_children.ScanState = .{};
    var remaining = options.max_total_xml_bytes;
    for (parts) |part| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const bytes = try archive.decode(archive.entries[part.entry_index], @min(options.max_part_xml_bytes, remaining));
        defer archive.allocator.free(bytes);
        var scanner: Scanner = .{ .a = a, .options = options, .report = &report, .direct = &direct };
        defer scanner.deinit();
        _ = try document_xml.visitBytes(a, bytes, bytes.len, options.xml, .{ .context = &scanner, .on_tag = Scanner.onTag });
        if (scanner.nodes.items.len != 0) return error.InvalidParagraphChildrenDepth;
        if (scanner.sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        var expected_paragraphs: usize = 0;
        for (part.sub_lists) |list| expected_paragraphs = std.math.add(usize, expected_paragraphs, list.paragraph_metadata.paragraphs) catch return error.LimitExceeded;
        if (scanner.paragraphs != expected_paragraphs) return error.InconsistentMasterPageSelection;
        report.parts += 1;
        report.sub_lists += scanner.sub_lists;
        report.xml_bytes = std.math.add(usize, report.xml_bytes, bytes.len) catch return error.LimitExceeded;
        remaining -= bytes.len;
    }
    return report;
}
