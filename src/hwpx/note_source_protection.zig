//! Request-local protection for exact source mutations, not display positions.
//! Field pairing/envelopes and Boolean decoding remain existing SSOTs.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const hp = @import("document_xml.zig").paragraph_uri;
const ResourceKind = @import("header_resources.zig").Kind;
const ResourceKey = struct { kind: ResourceKind, id: u32 };
const Resource = struct { node: usize, ambiguous: bool = false };
pub const Context = struct {
    session: *const editor.Session,
    fields: @import("source_field_analysis.zig").Lease,
    resources: std.AutoHashMap(ResourceKey, Resource),
    pub fn init(session: *const editor.Session) !Context {
        const a = session.allocator;
        var fields = try @import("source_field_analysis.zig").leaseForExterior(session);
        errdefer fields.deinit(a);
        var resources: std.AutoHashMap(ResourceKey, Resource) = .init(a);
        errdefer resources.deinit();
        if (session.original_header) |*header| for (header.elements, 0..) |_, node| {
            const kind = @import("header_resources.zig").kindAt(header, node) orelse continue;
            if (kind != .para_shape and kind != .char_shape and kind != .style) continue;
            const raw = (try header.attributeValue(a, node, "", "id")) orelse continue;
            const value = try raw.toUtf8(a, 4096);
            defer a.free(value);
            // A malformed unrelated ID is not permission for a selected ref;
            // only a lookup of that missing/ambiguous ref is refused below.
            const id = @import("xml_values.zig").unsigned32(value) catch continue;
            const entry = try resources.getOrPut(.{ .kind = kind, .id = id });
            if (entry.found_existing) entry.value_ptr.ambiguous = true else entry.value_ptr.* = .{ .node = node };
        };
        return .{ .session = session, .fields = fields, .resources = resources };
    }
    pub fn deinit(self: *Context) void {
        self.fields.deinit(self.session.allocator);
        self.resources.deinit();
        self.* = undefined;
    }
    fn lock(self: *const Context, tree: *const Tree, node: usize) !void {
        if (try tree.attributeValue(self.session.allocator, node, "", "lock")) |raw| {
            if (try @import("table_xml_fields.zig").boolean(self.session.allocator, raw, 4096)) return error.NoteDeleteReadOnly;
        }
    }
    fn reference(self: *const Context, tree: *const Tree, node: usize, name: []const u8, kind: ResourceKind) !void {
        const raw = (try tree.attributeValue(self.session.allocator, node, "", name)) orelse return;
        const id = try @import("table_xml_fields.zig").unsigned(self.session.allocator, raw, 4096);
        try self.checkResource(kind, id);
    }
    fn checkResource(self: *const Context, kind: ResourceKind, id: u32) !void {
        const resource = self.resources.get(.{ .kind = kind, .id = id }) orelse return error.UnresolvedNoteProtectionResource;
        if (resource.ambiguous) return error.UnresolvedNoteProtectionResource;
        const header = if (self.session.original_header) |*value| value else return error.UnresolvedNoteProtectionResource;
        var ancestor: ?usize = resource.node;
        var count: usize = 0;
        while (ancestor) |index| : (ancestor = header.elements[index].parent) {
            if (index >= header.elements.len or count >= header.elements.len) return error.SourceBindingMismatch;
            count += 1;
            try self.lock(header, index);
        }
    }
    fn inspectNode(self: *const Context, tree: *const Tree, index: usize) !void {
        try self.lock(tree, index);
        if (tree.elements[index].is(hp, "p")) {
            try self.reference(tree, index, "paraPrIDRef", .para_shape);
            try self.reference(tree, index, "styleIDRef", .style);
        } else if (tree.elements[index].is(hp, "run")) try self.reference(tree, index, "charPrIDRef", .char_shape);
    }
    fn ancestors(self: *const Context, tree: *const Tree, start: usize) !void {
        var cursor: ?usize = start;
        var count: usize = 0;
        while (cursor) |index| : (cursor = tree.elements[index].parent) {
            if (index >= tree.elements.len or count >= tree.elements.len) return error.SourceBindingMismatch;
            count += 1;
            try self.inspectNode(tree, index);
        }
    }
    fn sourceRange(self: *const Context, section: usize, start: usize, end: usize) !void {
        if (end <= start) return error.SourceBindingMismatch;
        const tree = &self.session.sections[section].tree;
        const report = &self.fields.source.report;
        // Exact linked source ranges, not the outer note's visible anchor unit.
        for (self.fields.source.fields) |range| {
            if (range.section == section and start < range.content_end and range.content_start < end) return error.ProtectedFieldRange;
        }
        for (report.markers) |marker| {
            if (marker.section_ordinal != section) continue;
            const element = tree.elements[marker.element_index];
            if (start < element.end and element.start_tag.start < end) return error.ProtectedFieldRange;
            if (marker.kind != .begin or marker.matched_marker_index != null) continue;
            const envelope = try @import("field_source_scope.zig").forBegin(tree, marker.element_index);
            if (start < envelope.end and envelope.start < end) return error.ProtectedFieldRange;
        }
    }
    pub fn createResources(self: *const Context, input: @import("note_create_profile.zig").Resources) !void {
        try self.checkResource(.para_shape, input.paragraph);
        try self.checkResource(.char_shape, input.character);
        try self.checkResource(.style, input.style);
    }
    /// Exact selected serializer event/span, not every host descendant.
    pub fn insertion(self: *const Context, section: usize, node: usize, start: usize, end: usize) !void {
        if (section >= self.session.sections.len) return error.InvalidSectionIndex;
        const tree = &self.session.sections[section].tree;
        if (node >= tree.elements.len or start > end or end > tree.source.len) return error.SourceBindingMismatch;
        try self.ancestors(tree, node);
        if (start < end) return self.sourceRange(section, start, end);
        for (self.fields.source.fields) |range| {
            if (range.section == section and start >= range.content_start and start <= range.content_end) return error.ProtectedFieldRange;
        }
        for (self.fields.source.report.markers) |marker| {
            if (marker.section_ordinal != section or marker.kind != .begin or marker.matched_marker_index != null) continue;
            const envelope = try @import("field_source_scope.zig").forBegin(tree, marker.element_index);
            if (start >= envelope.start and start <= envelope.end) return error.ProtectedFieldRange;
        }
    }
    /// Every node being removed is inspected; unrelated nodes are not inspected.
    pub fn removedSubtree(self: *const Context, section: usize, root_node: usize) !void {
        if (section >= self.session.sections.len) return error.InvalidSectionIndex;
        const tree = &self.session.sections[section].tree;
        if (root_node >= tree.elements.len) return error.SourceBindingMismatch;
        const root = tree.elements[root_node];
        try self.sourceRange(section, root.start_tag.start, root.end);
        try self.ancestors(tree, root_node);
        for (tree.elements[root_node + 1 ..], root_node + 1..) |element, index| {
            if (element.start_tag.start >= root.end) break;
            try self.inspectNode(tree, index);
        }
    }
    /// Only the actual scalar start tag and its inherited/resource protection.
    pub fn scalarTag(self: *const Context, section: usize, number_node: usize) !void {
        if (section >= self.session.sections.len) return error.InvalidSectionIndex;
        const tree = &self.session.sections[section].tree;
        if (number_node >= tree.elements.len) return error.SourceBindingMismatch;
        const span = tree.elements[number_node].start_tag;
        try self.sourceRange(section, span.start, span.end);
        try self.ancestors(tree, number_node);
    }
};
