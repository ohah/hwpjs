const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const line_segments = @import("line_segments.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    scan: line_segments.Options = .{},
    xml: document_xml.Options = .{},
};

/// Direct line segments inside descendant paragraphs of root-direct subLists.
/// Numeric lexical rules are owned by line_segments.zig, not duplicated here.
pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    paragraphs: usize = 0,
    lines: line_segments.Report = .{},
    xml_bytes: usize = 0,
};

const Kind = enum { other, paragraph, array, segment };
const Node = struct {
    in_scope: bool = false,
    kind: Kind = .other,
    direct_segments: usize = 0,
};

const Scanner = struct {
    a: std.mem.Allocator,
    options: Options,
    report: *Report,
    nodes: std.ArrayList(Node) = .empty,
    sub_lists: usize = 0,
    paragraphs: usize = 0,

    fn deinit(self: *Scanner) void {
        self.nodes.deinit(self.a);
    }

    fn finish(self: *Scanner, node: Node) void {
        if (node.kind == .array) self.report.lines.empty_arrays += @intFromBool(node.direct_segments == 0);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 0 or depth != self.nodes.items.len) return error.InvalidLineSegmentDepth;
            self.finish(self.nodes.pop().?);
            return;
        }
        if (depth != self.nodes.items.len + 1) return error.InvalidLineSegmentDepth;
        const parent: Node = if (depth == 1) .{} else self.nodes.items[depth - 2];
        var node: Node = .{ .in_scope = parent.in_scope };
        if (depth == 1) {
            if (!try attrs.element(tag, scope, "", "masterPage")) return error.InvalidMasterPageRoot;
        } else if (depth == 2) {
            node.in_scope = try attrs.element(tag, scope, document_xml.paragraph_uri, "subList");
            if (node.in_scope) self.sub_lists += 1;
        }
        if (parent.in_scope and parent.kind == .array) {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "lineseg")) {
                try line_segments.noteSegmentTag(self.a, tag, self.options.scan, &self.report.lines);
                self.nodes.items[depth - 2].direct_segments += 1;
                node.kind = .segment;
            } else {
                self.report.lines.array_other_direct += 1;
                const name = try scope.expandElement(tag.name);
                self.report.lines.array_foreign_direct += @intFromBool(!std.mem.eql(u8, name.uri, document_xml.paragraph_uri));
            }
        } else if (parent.in_scope and parent.kind == .segment) {
            self.report.lines.segment_direct_children += 1;
            const name = try scope.expandElement(tag.name);
            self.report.lines.segment_foreign_direct += @intFromBool(!std.mem.eql(u8, name.uri, document_xml.paragraph_uri));
        }
        if (node.in_scope and try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            node.kind = .paragraph;
            self.paragraphs += 1;
        } else if (parent.in_scope and parent.kind == .paragraph and try attrs.element(tag, scope, document_xml.paragraph_uri, "linesegarray")) {
            try line_segments.noteArrayTag(tag, self.options.scan, &self.report.lines);
            node.kind = .array;
        }
        if (tag.kind == .start) try self.nodes.append(self.a, node) else self.finish(node);
    }
};

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, options: Options) !Report {
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var report: Report = .{};
    var remaining = options.max_total_xml_bytes;
    for (parts) |part| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const bytes = try archive.decode(archive.entries[part.entry_index], @min(options.max_part_xml_bytes, remaining));
        defer archive.allocator.free(bytes);
        var scanner: Scanner = .{ .a = a, .options = options, .report = &report };
        defer scanner.deinit();
        _ = try document_xml.visitBytes(a, bytes, bytes.len, options.xml, .{ .context = &scanner, .on_tag = Scanner.onTag });
        if (scanner.nodes.items.len != 0) return error.InvalidLineSegmentDepth;
        if (scanner.sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        var expected_paragraphs: usize = 0;
        for (part.sub_lists) |list| expected_paragraphs = std.math.add(usize, expected_paragraphs, list.paragraph_metadata.paragraphs) catch return error.LimitExceeded;
        if (scanner.paragraphs != expected_paragraphs) return error.InconsistentMasterPageSelection;
        report.parts += 1;
        report.sub_lists += scanner.sub_lists;
        report.paragraphs = std.math.add(usize, report.paragraphs, scanner.paragraphs) catch return error.LimitExceeded;
        report.xml_bytes = std.math.add(usize, report.xml_bytes, bytes.len) catch return error.LimitExceeded;
        remaining -= bytes.len;
    }
    return report;
}
