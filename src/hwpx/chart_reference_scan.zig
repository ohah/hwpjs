const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const chart_parts = @import("chart_parts.zig");
const selection = @import("compatibility_selection.zig");

pub const Options = struct {
    max_section_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_section_xml_bytes: usize = 256 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_sites: usize = 1_000_000,
    branch_policy: selection.Policy = .{},
    xml: document_xml.Options = .{},
};

const Node = enum { other, section, paragraph, run, switch_element, branch, chart };
const Frame = struct { kind: Node = .other, active: bool = true, selected: selection.State = .{} };

const Context = struct {
    allocator: std.mem.Allocator,
    source_item_index: usize,
    options: Options,
    resolver: *chart_parts.Resolver,
    stack: [256]Frame = @splat(.{}),

    fn classify(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !Node {
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.section_uri, "sec")) return error.InvalidSectionRoot;
            return .section;
        }
        const parent = self.stack[depth - 2].kind;
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) return .paragraph;
        if (parent == .paragraph and try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) return .run;
        if ((parent == .run or parent == .branch) and try attrs.element(tag, scope, document_xml.paragraph_uri, "switch")) return .switch_element;
        if (parent == .switch_element) {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "case")) return .branch;
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "default")) return .branch;
        }
        if ((parent == .run or parent == .branch) and try attrs.element(tag, scope, document_xml.paragraph_uri, "chart")) return .chart;
        return .other;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        if (depth == 0 or depth > self.stack.len) return error.LimitExceeded;
        const node = try self.classify(tag, scope, depth);
        const parent: Frame = if (depth == 1) .{} else self.stack[depth - 2];
        var frame: Frame = .{ .kind = node, .active = parent.active };
        if (parent.active and parent.kind == .switch_element and node == .branch) {
            const is_case = try attrs.element(tag, scope, document_xml.paragraph_uri, "case");
            frame.active = try selection.choose(self.allocator, tag, scope, is_case, self.options.max_attribute_bytes, self.options.branch_policy, &self.stack[depth - 2].selected);
        }
        if (tag.kind == .start) self.stack[depth - 1] = frame;
        if (!frame.active) return;
        const raw_ref = try attrs.attribute(self.allocator, tag, scope, "chartIDRef", self.options.max_attribute_bytes);
        if (node != .chart and raw_ref == null) return;
        if (self.resolver.report.observed_sites == self.options.max_sites) {
            if (raw_ref) |value| self.allocator.free(value);
            return error.LimitExceeded;
        }
        self.resolver.report.observed_sites += 1;
        if (node == .chart) return self.resolver.note(self.source_item_index, raw_ref);
        return self.resolver.noteUnclassified(self.source_item_index, raw_ref.?);
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, source_item_index: usize, resolver: *chart_parts.Resolver, options: Options, remaining: *usize) !void {
    const max_bytes = @min(options.max_section_xml_bytes, remaining.*);
    const bytes = try archive.decode(entry, max_bytes);
    defer archive.allocator.free(bytes);
    var context: Context = .{ .allocator = a, .source_item_index = source_item_index, .options = options, .resolver = resolver };
    _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    remaining.* -= bytes.len;
    resolver.report.section_xml_bytes += bytes.len;
}
