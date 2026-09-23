const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content = @import("xml_part_content.zig");
const namespace_profile = @import("namespace_profile.zig");

pub const PartKind = enum { header, section };

pub const Span = struct {
    start: usize,
    end: usize,
};

/// All element names borrow Tree.source (local) or Tree.uris (URI).
/// Child/sibling indices preserve XML order, including unsupported elements.
pub const Element = struct {
    name: xml.namespaces.ExpandedName,
    start_tag: Span,
    end_tag: ?Span = null,
    end: usize,
    parent: ?usize,
    first_child: ?usize = null,
    next_sibling: ?usize = null,
    last_child: ?usize = null,

    pub fn is(self: Element, uri: []const u8, local: []const u8) bool {
        return std.mem.eql(u8, self.name.uri, uri) and self.name.local.equals(local, false);
    }
};

pub const Options = struct {
    max_xml_bytes: usize = 128 * 1024 * 1024,
    max_nodes: usize = 2_000_000,
    xml: document_xml.Options = .{},
};

/// Owns an exact decoded header or section XML source and a namespace-aware element
/// index. Text, comments, CDATA, attributes, and unknown nodes stay in source;
/// this is not yet a semantic document model or a serializer.
pub const Tree = struct {
    source: []u8,
    elements: []Element,
    uris: [][]u8,
    part_kind: PartKind,
    section_ordinal: ?usize,
    item_index: usize,
    xml_report: xml.document.Report,

    pub fn deinit(self: *Tree, a: std.mem.Allocator) void {
        for (self.uris) |uri| a.free(uri);
        a.free(self.uris);
        a.free(self.elements);
        a.free(self.source);
        self.* = undefined;
    }

    pub fn sourceOf(self: *const Tree, index: usize) []const u8 {
        const element = self.elements[index];
        return self.source[element.start_tag.start..element.end];
    }

    /// Returns the original XML value of one expanded attribute. Null means
    /// absent; an empty value remains present. The value borrows Tree.source
    /// and can be normalized with Value.toUtf8 while the tree remains alive.
    pub fn attributeValue(self: *const Tree, a: std.mem.Allocator, index: usize, uri: []const u8, local: []const u8) !?xml.attribute_value.Value {
        return @import("xml_part_attributes.zig").find(a, self, index, uri, local);
    }

    pub const ContentEvent = content.Event;
    pub const ContentVisitor = content.Visitor;
    pub const OrderedEvent = content.OrderedEvent;
    pub const OrderedVisitor = content.OrderedVisitor;

    /// Visits ordered CharData and CDATA chunks with their exact parent index.
    /// Raw content borrows this tree; callback failure may follow prior events.
    pub fn visitContent(self: *const Tree, a: std.mem.Allocator, visitor: ContentVisitor) !void {
        return content.visit(a, self, visitor);
    }

    /// Visits element boundaries and direct character/CDATA content in XML
    /// order. Unsupported elements are retained as indexed elements.
    pub fn visitOrdered(self: *const Tree, a: std.mem.Allocator, visitor: OrderedVisitor) !void {
        return content.visitOrdered(a, self, visitor);
    }
};

const Builder = struct {
    allocator: std.mem.Allocator,
    source: []u8,
    max_nodes: usize,
    part_kind: PartKind,
    elements: std.ArrayList(Element) = .empty,
    uris: std.ArrayList([]u8) = .empty,
    uri_map: std.StringHashMapUnmanaged(usize) = .empty,
    stack: std.ArrayList(usize) = .empty,

    fn deinit(self: *Builder) void {
        self.stack.deinit(self.allocator);
        self.uri_map.deinit(self.allocator);
        for (self.uris.items) |uri| self.allocator.free(uri);
        self.uris.deinit(self.allocator);
        self.elements.deinit(self.allocator);
    }

    fn span(self: *const Builder, raw: []const u8) !Span {
        const base = @intFromPtr(self.source.ptr);
        const start_ptr = @intFromPtr(raw.ptr);
        if (start_ptr < base or start_ptr - base > self.source.len) return error.InvalidSourceSpan;
        const start = start_ptr - base;
        if (raw.len > self.source.len - start) return error.InvalidSourceSpan;
        return .{ .start = start, .end = start + raw.len };
    }

    fn internUri(self: *Builder, uri: []const u8) ![]const u8 {
        if (self.uri_map.get(uri)) |index| return self.uris.items[index];
        const copy = try self.allocator.dupe(u8, uri);
        errdefer self.allocator.free(copy);
        const index = self.uris.items.len;
        try self.uris.append(self.allocator, copy);
        errdefer _ = self.uris.pop();
        try self.uri_map.put(self.allocator, copy, index);
        return copy;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Builder = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (self.stack.items.len != depth) return error.InvalidSectionTreeDepth;
            const index = self.stack.pop().?;
            const closing = try self.span(tag.raw);
            self.elements.items[index].end_tag = closing;
            self.elements.items[index].end = closing.end;
            return;
        }
        if (depth != self.stack.items.len + 1) return error.InvalidSectionTreeDepth;
        if (depth == 1) {
            const root_uri = if (self.part_kind == .header) document_xml.head_uri else document_xml.section_uri;
            const root_local = if (self.part_kind == .header) "head" else "sec";
            const uri_suffix = if (self.part_kind == .header) "head" else "section";
            if (!try attrs.element(tag, scope, root_uri, root_local)) {
                if (namespace_profile.isVersionedRoot(try scope.expandElement(tag.name), root_local, uri_suffix)) return error.UnsupportedHwpxNamespaceProfile;
                return if (self.part_kind == .header) error.InvalidHeaderRoot else error.InvalidSectionRoot;
            }
        }
        if (self.elements.items.len == self.max_nodes) return error.LimitExceeded;
        const name = try scope.expandElement(tag.name);
        const owned_uri = try self.internUri(name.uri);
        const opening = try self.span(tag.raw);
        const parent: ?usize = if (self.stack.items.len == 0) null else self.stack.items[self.stack.items.len - 1];
        const index = self.elements.items.len;
        try self.elements.append(self.allocator, .{
            .name = .{ .uri = owned_uri, .local = name.local },
            .start_tag = opening,
            .end = opening.end,
            .parent = parent,
        });
        if (parent) |parent_index| {
            const previous = self.elements.items[parent_index].last_child;
            if (previous) |sibling| self.elements.items[sibling].next_sibling = index else self.elements.items[parent_index].first_child = index;
            self.elements.items[parent_index].last_child = index;
        }
        if (tag.kind == .start) try self.stack.append(self.allocator, index);
    }
};

/// The returned tree owns a copy of bytes, independent of the ZIP archive and
/// the caller's buffer. XML syntax and namespace checks use the common SSOT.
pub fn parse(a: std.mem.Allocator, bytes: []const u8, part_kind: PartKind, section_ordinal: ?usize, item_index: usize, options: Options) !Tree {
    if ((part_kind == .header) != (section_ordinal == null)) return error.InvalidPartOrdinal;
    if (bytes.len > options.max_xml_bytes) return error.LimitExceeded;
    const source = try a.dupe(u8, bytes);
    errdefer a.free(source);
    var builder: Builder = .{ .allocator = a, .source = source, .max_nodes = options.max_nodes, .part_kind = part_kind };
    defer builder.deinit();
    const report = try document_xml.visitBytes(a, source, options.max_xml_bytes, options.xml, .{ .context = &builder, .on_tag = Builder.onTag });
    if (builder.stack.items.len != 0 or builder.elements.items.len != report.elements) return error.InvalidSectionTreeDepth;
    const elements = try builder.elements.toOwnedSlice(a);
    errdefer a.free(elements);
    const uris = try builder.uris.toOwnedSlice(a);
    return .{
        .source = source,
        .elements = elements,
        .uris = uris,
        .part_kind = part_kind,
        .section_ordinal = section_ordinal,
        .item_index = item_index,
        .xml_report = report,
    };
}
