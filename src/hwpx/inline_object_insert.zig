//! Shared immutable source splice for newly authored inline objects.
//! No ZIP/OPF/model/history ownership. Fragment authors must validate their payload.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const names = @import("document_xml.zig");
const scanner = @import("section_text.zig");
const writer = @import("xml_source_writer.zig");
const picture = @import("../image/image_insertion.zig");

pub const Target = struct {
    section: usize,
    paragraph: usize,
    unit: u32,
    expected_text: []const u8,
};

pub fn verifySource(input: []const u8, expected: [32]u8) !void {
    var actual: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &actual, .{});
    if (!std.mem.eql(u8, &actual, &expected)) return error.SourceHashMismatch;
}

pub fn locate(a: std.mem.Allocator, tree: *const Tree, target: Target, counters: *scanner.Report) !?usize {
    if (tree.section_ordinal != target.section) return null;
    const Context = struct {
        tree: *const Tree,
        target: Target,
        found: ?usize = null,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (value != .paragraph_start) return;
            const boundary = value.paragraph_start;
            if (boundary.location.section_ordinal != self.target.section or boundary.location.paragraph_ordinal != self.target.paragraph) return;
            if (self.found != null) return error.SourceBindingMismatch;
            self.found = try self.tree.startTagIndex(boundary.tag.raw);
        }
    };
    var context: Context = .{ .tree = tree, .target = target };
    try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidSectionIndex, tree.item_index, .{}, counters, .{ .context = &context, .on_event = Context.event });
    return context.found;
}

/// Conservative namespace: every unprefixed id and instid in supplied trees.
/// Callers supply header AND all sections, including inactive/nested objects.
pub fn nextIds(a: std.mem.Allocator, trees: []const Tree, count: usize) ![]u32 {
    if (count > 1024) return error.LimitExceeded;
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    for (trees) |*tree| for (tree.elements, 0..) |_, index| {
        for ([_][]const u8{ "id", "instid" }) |field| {
            const raw = (try tree.attributeValue(a, index, "", field)) orelse continue;
            const value = try raw.toUtf8(a, 4096);
            defer a.free(value);
            // Non-numeric resource IDs are a distinct vocabulary. A wide decimal
            // integer cannot collide with any u32 returned by this function.
            const id = @import("xml_values.zig").unsigned32(value) catch continue;
            try used.put(a, id, {});
        }
    };
    return allocateIds(a, &used, count);
}

/// Physical XML inventory includes orphan sections, master pages, inactive
/// branches and header/settings IDs. No manifest-selected-only blind spot.
pub fn nextPackageIds(a: std.mem.Allocator, doc: *const @import("package.zig").Document, count: usize, xml_limit: usize, total_limit: usize) ![]u32 {
    if (count > 1024) return error.LimitExceeded;
    const Context = struct {
        a: std.mem.Allocator,
        used: std.AutoHashMapUnmanaged(u32, void) = .empty,
        fn tag(raw: *anyopaque, value: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, _: usize) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (value.kind == .end) return;
            const name = try scope.expandElement(value.name);
            if (std.mem.eql(u8, name.uri, "http://www.w3.org/2000/09/xmldsig#")) return error.SignedDocument;
            for ([_][]const u8{ "id", "instid" }) |field| {
                const text = (try @import("xml_attributes.zig").attribute(self.a, value, scope, field, 4096)) orelse continue;
                defer self.a.free(text);
                const id = @import("xml_values.zig").unsigned32(text) catch continue;
                try self.used.put(self.a, id, {});
            }
        }
    };
    var context: Context = .{ .a = a };
    defer context.used.deinit(a);
    var total: usize = 0;
    for (doc.archive.entries) |entry| {
        const ext = std.fs.path.extension(entry.name);
        if (!std.ascii.eqlIgnoreCase(ext, ".xml") and !std.ascii.eqlIgnoreCase(ext, ".hpf")) continue;
        const bytes = try doc.archive.decode(entry, @min(xml_limit, total_limit -| total));
        defer a.free(bytes);
        if (bytes.len > total_limit -| total) return error.LimitExceeded;
        total += bytes.len;
        _ = try names.visitBytes(a, bytes, xml_limit, .{}, .{ .context = &context, .on_tag = Context.tag });
    }
    return allocateIds(a, &context.used, count);
}

fn allocateIds(a: std.mem.Allocator, used: *const std.AutoHashMapUnmanaged(u32, void), count: usize) ![]u32 {
    const result = try a.alloc(u32, count);
    errdefer a.free(result);
    var candidate: u32 = 1;
    for (result, 0..) |*id, i| {
        while (used.contains(candidate)) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
        id.* = candidate;
        if (i + 1 < count) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
    }
    return result;
}

/// General body caret only. No owner inference from a display string.
/// Reuses the established typed t-split serializer, including XML escaping,
/// UTF-16 scalar boundaries and paragraph-local line cache invalidation.
pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, target: Target, fragment: []const u8, limit: usize) ![]u8 {
    // R1 addresses the first section; later sections need a document-global
    // scanner offset in this common contract, never a guessed local ordinal.
    if (target.section != 0) return error.UnsupportedInsertSections;
    if (tree.part_kind != .section or tree.section_ordinal != target.section) return error.InvalidSectionIndex;
    if (tree.elements.len == 0 or tree.elements[0].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(names.paragraph_uri, "p")) return error.InvalidParagraphIndex;
    const parent = tree.elements[paragraph].parent orelse return error.UnsupportedInlineObjectOwner;
    if (!tree.elements[parent].is(names.section_uri, "sec")) return error.UnsupportedInlineObjectOwner;
    try @import("field_free_section.zig").validate(a, tree, limit);
    // Validate only the target's physical cache before choosing its deletion
    // span. The shared whole-section cache writer is deliberately not used.
    try @import("source_grid_line_cache.zig").validate(a, tree, paragraph);
    if (target.expected_text.len > picture.max_text_bytes or fragment.len > limit) return error.LimitExceeded;
    _ = try picture.byteOffset(target.expected_text, target.unit);
    // The locator and caller-provided source node must agree.
    var counters: scanner.Report = .{};
    const resolved = (try locate(a, tree, target, &counters)) orelse return error.InvalidParagraphIndex;
    if (resolved != paragraph) return error.SourceBindingMismatch;

    // Plain host profile shared by equation/chart. Preserve a leading section
    // definition and column declaration, but never accept other controls.
    var lines: ?usize = null;
    var leading = true;
    var run = tree.elements[paragraph].first_child;
    while (run) |r| : (run = tree.elements[r].next_sibling) {
        const element = tree.elements[r];
        if (element.is(names.paragraph_uri, "linesegarray")) {
            if (lines != null) return error.UnsupportedInlineObjectOwner;
            lines = r;
            continue;
        }
        if (!element.is(names.paragraph_uri, "run")) return error.UnsupportedInlineObjectOwner;
        var child = element.first_child;
        while (child) |c| : (child = tree.elements[c].next_sibling) {
            const node = tree.elements[c];
            if (node.is(names.paragraph_uri, "t") and node.first_child == null) {
                leading = false;
                continue;
            }
            if (leading and node.is(names.paragraph_uri, "secPr")) continue;
            if (leading and node.is(names.paragraph_uri, "ctrl")) {
                const col = node.first_child orelse return error.UnsupportedInlineObjectOwner;
                if (tree.elements[col].is(names.paragraph_uri, "colPr") and tree.elements[col].next_sibling == null) continue;
            }
            return error.UnsupportedInlineObjectOwner;
        }
    }

    var sites = try @import("text_sites.zig").collect(a, tree, .{ .max_text_bytes = picture.max_text_bytes });
    defer sites.deinit(a);
    var actual: std.ArrayList(u8) = .empty;
    defer actual.deinit(a);
    var chosen: ?usize = null;
    var local_at: usize = 0;
    var previous: ?usize = null;
    const byte_at = try picture.byteOffset(target.expected_text, target.unit);
    for (sites.items, 0..) |site, index| {
        const r = tree.elements[site.element_index].parent orelse continue;
        if (tree.elements[r].parent != paragraph) continue;
        if (!tree.elements[site.element_index].is(names.paragraph_uri, "t") or site.missing_text) return error.UnsupportedInlineObjectOwner;
        // Separate CDATA/comment text events must never be silently dropped.
        if (previous == site.element_index) return error.UnsupportedInlineObjectTextSegments;
        previous = site.element_index;
        if (site.text.len > picture.max_text_bytes -| actual.items.len) return error.LimitExceeded;
        if (chosen == null and byte_at >= actual.items.len and byte_at - actual.items.len <= site.text.len) {
            chosen = index;
            local_at = byte_at - actual.items.len;
        }
        try actual.appendSlice(a, site.text);
    }
    if (!std.mem.eql(u8, actual.items, target.expected_text)) return error.InlineObjectTextMismatch;
    const site = sites.items[chosen orelse return error.UnsupportedInlineObjectOwner];
    const element = tree.elements[site.element_index];
    const original_text = tree.sourceOf(site.element_index);
    if (std.mem.indexOf(u8, original_text, "<!--") != null or std.mem.indexOf(u8, original_text, "<?") != null)
        return error.UnsupportedInlineObjectTextSegments;
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, site.element_index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try @import("../xml/namespaces.zig").isDeclaration(attribute.name)) continue;
        if (!std.mem.eql(u8, attribute.name.raw, "xml:space")) return error.UnsupportedInlineObjectTextAttributes;
    }
    const raw_open = tree.source[element.start_tag.start..element.start_tag.end];
    const opening = if (element.end_tag == null) try std.fmt.allocPrint(a, "{s}>", .{raw_open[0 .. raw_open.len - 2]}) else try a.dupe(u8, raw_open);
    defer a.free(opening);
    const closing = try std.fmt.allocPrint(a, "</{s}>", .{tag.name.raw});
    defer a.free(closing);
    const left = try @import("../xml/text_writer.zig").encode(a, site.text[0..local_at], limit);
    defer a.free(left);
    const right = try @import("../xml/text_writer.zig").encode(a, site.text[local_at..], limit);
    defer a.free(right);
    const replacement = try std.fmt.allocPrint(a, "{s}{s}{s}{s}{s}{s}{s}", .{ opening, left, closing, fragment, opening, right, closing });
    defer a.free(replacement);
    var changes: [2]writer.Change = undefined;
    changes[0] = .{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = replacement };
    var count: usize = 1;
    if (lines) |node| {
        changes[1] = .{ .start = tree.elements[node].start_tag.start, .end = tree.elements[node].end, .text = "", .serialized_xml = "" };
        count += 1;
        if (changes[1].start < changes[0].start) std.mem.swap(writer.Change, &changes[0], &changes[1]);
    }
    return writer.write(a, tree.source, changes[0..count], limit);
}
