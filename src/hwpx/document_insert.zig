//! Native, memory-only preparation of one HWPX body insertion. Both input
//! packages are immutable. Only the complete, reopened replacement is returned.
const std = @import("std");
const editor = @import("editor_session.zig");
const package = @import("package.zig");
const resources = @import("document_insert_resources.zig");
const patch = @import("document_insert_xml.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Change = @import("xml_source_writer.zig").Change;
const names = @import("document_xml.zig");
const hp = names.paragraph_uri;
const static_table = @import("document_insert_table.zig");

pub const Caret = struct { paragraph: usize, unit: u32 };
pub const Options = struct {
    max_input_bytes: usize = 8 * 1024 * 1024,
    max_output_bytes: usize = 16 * 1024 * 1024,
    max_xml_bytes: usize = 8 * 1024 * 1024,
    max_paragraphs: usize = 4096,
};
pub const Prepared = struct {
    bytes: []u8,
    first_inserted_paragraph: usize,
    inserted_paragraphs: usize,
    inserted_cell_paragraphs: usize = 0,

    pub fn deinit(self: *Prepared, allocator: std.mem.Allocator) void {
        allocator.free(self.bytes);
        self.* = undefined;
    }
};

const Root = struct { node: usize, ordinal: usize, has_table: bool };
const Body = struct {
    roots: []const Root = &.{},
    paragraphs: usize = 0,
    tables: usize = 0,
    section_properties: ?usize = null,
    columns: ?usize = null,
};

/// Single-section profile, 1-based paragraph and UTF-16 caret. Interior
/// positions use the canonical native split on a detached destination.
pub fn prepare(allocator: std.mem.Allocator, destination: []const u8, donor: []const u8, caret: Caret, options: Options) !Prepared {
    if (destination.len > options.max_input_bytes or donor.len > options.max_input_bytes)
        return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const open_options: editor.Options = .{
        .max_input_bytes = options.max_output_bytes,
        .max_output_bytes = options.max_output_bytes,
        .max_xml_bytes = options.max_xml_bytes,
        .max_text_bytes = options.max_xml_bytes,
        .max_sites = @max(options.max_paragraphs, 1),
        .max_sections = 2,
    };
    var target_package = try package.inspectDocument(a, destination, .{});
    defer target_package.deinit(a);
    var source_package = try package.inspectDocument(a, donor, .{});
    defer source_package.deinit(a);
    for ([_]*const package.Document{ &target_package, &source_package }) |doc| {
        const header = doc.archive.entries[try entryIndex(doc, "Contents/header.xml")];
        if (header.uncompressed_size > options.max_xml_bytes) return error.LimitExceeded;
    }
    var target = try editor.open(a, destination, open_options);
    defer target.deinit();
    var source = try editor.open(a, donor, open_options);
    defer source.deinit();
    if (target.sections.len != 1 or source.sections.len != 1) return error.UnsupportedInsertSections;
    const target_header = if (target.original_header) |*header| header else return error.MissingInsertPart;
    const source_header = if (source.original_header) |*header| header else return error.MissingInsertPart;
    if (try patch.number(a, target_header, 0, "secCnt") != 1 or
        try patch.number(a, source_header, 0, "secCnt") != 1) return error.UnsupportedInsertSections;

    try validatePackage(a, &target_package, target.sections[0].entry_index);
    try validatePackage(a, &source_package, source.sections[0].entry_index);
    try equalOptionalPart(a, &target_package, &source_package, "version.xml", options.max_xml_bytes);
    try validateReferences(a, &target_package);
    try validateReferences(a, &source_package);

    const target_tree = &target.sections[0].tree;
    const source_tree = &source.sections[0].tree;
    const target_body = try readBody(a, target_tree, options.max_paragraphs);
    const source_body = try readBody(a, source_tree, options.max_paragraphs);
    if (!std.mem.eql(u8, patch.opening(target_tree, 0), patch.opening(source_tree, 0)))
        return error.IncompatibleInsertNamespace;
    try equalPrologue(target_tree, target_body, source_tree, source_body);
    if (caret.paragraph == 0 or caret.paragraph > target_body.paragraphs)
        return error.InvalidParagraphIndex;
    const root_index = for (target_body.roots, 0..) |root, index| {
        if (root.ordinal == caret.paragraph) {
            if (root.has_table) return error.UnsupportedInsertCaretOwner;
            break index;
        }
    } else return error.UnsupportedInsertCaretOwner;

    const section = &target.sections[0];
    if (section.last_paragraph != target_body.paragraphs or source.sections[0].last_paragraph != source_body.paragraphs)
        return error.SourceBindingMismatch;
    const owner = try @import("paragraph_site_owner.zig").resolve(target_tree, &section.sites, section.locations, caret.paragraph);
    if (owner != target_body.roots[root_index].node) return error.SourceBindingMismatch;
    try validateTableReferences(a, &target_package, target_tree, target_body);
    try validateTableReferences(a, &source_package, source_tree, source_body);
    const positions = @import("paragraph_text_positions.zig");
    const segments = try positions.build(a, target_tree, &section.sites, section.locations, caret.paragraph);
    defer a.free(segments);
    try positions.validateBoundary(&section.sites, segments, caret.unit);
    const units = segments[segments.len - 1].end_unit;
    const keep_prologue = caret.paragraph == 1 and (target_body.section_properties != null or target_body.columns != null);
    const split = (caret.unit > 0 and caret.unit < units) or (caret.unit == 0 and units > 0 and keep_prologue);
    const before = caret.unit == 0 and !keep_prologue;
    const first = caret.paragraph + @as(usize, @intFromBool(!before));

    const remapping = try resources.prepare(a, target_header, source_header, options.max_xml_bytes);
    var staged: ?editor.Session = null;
    defer if (staged) |*session| session.deinit();
    if (split) {
        if (!try target.splitParagraph(0, caret.paragraph, caret.unit, 0)) return error.InsertSplitFailed;
        const bytes = try target.save();
        staged = try editor.open(a, bytes, open_options);
    }
    const basis = if (staged) |*session| session else &target;
    const basis_tree = &basis.sections[0].tree;
    const basis_body = if (split) try readBody(a, basis_tree, options.max_paragraphs) else target_body;
    if (basis_body.paragraphs != target_body.paragraphs + @intFromBool(split) or
        basis_body.roots.len != target_body.roots.len + @intFromBool(split))
        return error.InsertSplitFailed;
    const ids = try @import("paragraph_instance_ids.zig").nextMany(a, &.{basis_tree.*}, &.{}, source_body.paragraphs, options.max_paragraphs);
    const object_ids = if (source_body.tables == 0) &.{} else try @import("created_table_object_ids.zig").nextManySource(a, &.{basis_tree.*}, source_body.tables);
    var imported: std.ArrayList(u8) = .empty;
    var rewrite: IdRewrite = .{ .paragraphs = ids, .tables = object_ids };
    for (source_body.roots, 0..) |root, ordinal| {
        const fragment = try copyParagraph(a, source_tree, root.node, &rewrite, &remapping, if (ordinal == 0) source_body else .{}, options.max_xml_bytes);
        try patch.append(a, &imported, fragment, options.max_xml_bytes);
    }
    if (rewrite.paragraph_cursor != ids.len or rewrite.table_cursor != object_ids.len)
        return error.InvalidInsertResult;
    const insert_root = root_index + @as(usize, @intFromBool(!before));
    const insertion = if (insert_root < basis_body.roots.len)
        basis_tree.elements[basis_body.roots[insert_root].node].start_tag.start
    else
        basis_tree.elements[basis_body.roots[basis_body.roots.len - 1].node].end;
    const change: Change = .{ .start = insertion, .end = insertion, .text = "", .serialized_xml = imported.items };
    const changed_section = try @import("xml_source_writer.zig").write(a, basis_tree.source, &.{change}, options.max_xml_bytes);
    if (remapping.header.len > options.max_xml_bytes -| changed_section.len) return error.LimitExceeded;
    const header_index = try entryIndex(&target_package, "Contents/header.xml");
    const zip = @import("../zip/replace_writer.zig");
    const bytes = try zip.write(a, basis.source, &.{
        .{ .entry_index = header_index, .bytes = remapping.header },
        .{ .entry_index = basis.sections[0].entry_index, .bytes = changed_section },
    }, .{ .max_output_bytes = options.max_output_bytes });
    var checked = try editor.open(a, bytes, open_options);
    defer checked.deinit();
    if (checked.sections.len != 1 or checked.sections[0].last_paragraph != basis_body.paragraphs + source_body.paragraphs)
        return error.InvalidInsertResult;
    var checked_package = try package.inspectDocument(a, bytes, .{});
    defer checked_package.deinit(a);
    try validateReferences(a, &checked_package);
    const checked_body = try readBody(a, &checked.sections[0].tree, options.max_paragraphs);
    if (checked_body.roots.len != basis_body.roots.len + source_body.roots.len or
        checked_body.tables != basis_body.tables + source_body.tables or
        checked_body.roots[insert_root].ordinal != first)
        return error.InvalidInsertResult;
    try validateTableReferences(a, &checked_package, &checked.sections[0].tree, checked_body);
    return .{
        .bytes = try allocator.dupe(u8, bytes),
        .first_inserted_paragraph = first,
        .inserted_paragraphs = source_body.roots.len,
        .inserted_cell_paragraphs = source_body.paragraphs - source_body.roots.len,
    };
}

fn entryIndex(doc: *const package.Document, name: []const u8) !usize {
    for (doc.archive.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, name)) return index;
    }
    return error.MissingInsertPart;
}

fn validatePackage(a: std.mem.Allocator, doc: *const package.Document, section_index: usize) !void {
    var protection = try doc.inspectProtection(a, .{});
    defer protection.deinit(a);
    if (protection.encrypted_paths.len != 0) return error.EncryptedDocument;
    if (!std.mem.eql(u8, doc.container.path, "Contents/content.hpf")) return error.UnsupportedInsertPackage;
    for (doc.archive.entries, 0..) |entry, index| {
        if (index == section_index) continue;
        for ([_][]const u8{
            "mimetype",             "version.xml",         "META-INF/container.xml", "META-INF/manifest.xml",
            "Contents/content.hpf", "Contents/header.xml", "settings.xml",
        }) |allowed| {
            if (std.mem.eql(u8, entry.name, allowed)) break;
        } else return error.UnsupportedInsertPackage;
    }
    const header_index = try entryIndex(doc, "Contents/header.xml");
    const settings_index = entryIndex(doc, "settings.xml") catch null;
    for (doc.manifest.items) |item| {
        const index = item.entry_index orelse return error.UnsupportedInsertPackage;
        if (index != header_index and index != section_index and index != settings_index)
            return error.UnsupportedInsertPackage;
    }
    for (doc.manifest.spine) |reference| {
        const index = doc.manifest.items[reference.item_index].entry_index orelse return error.UnsupportedInsertPackage;
        if (index != header_index and index != section_index) return error.UnsupportedInsertPackage;
    }
}

fn equalOptionalPart(a: std.mem.Allocator, left: *const package.Document, right: *const package.Document, path: []const u8, limit: usize) !void {
    const first = left.archive.find(path);
    const second = right.archive.find(path);
    if (first == null and second == null) return;
    const lhs = try left.archive.decode(first orelse return error.IncompatibleInsertVersion, limit);
    defer a.free(lhs);
    const rhs = try right.archive.decode(second orelse return error.IncompatibleInsertVersion, limit);
    defer a.free(rhs);
    if (!std.mem.eql(u8, lhs, rhs)) return error.IncompatibleInsertVersion;
}

fn validateReferences(a: std.mem.Allocator, doc: *const package.Document) !void {
    const section = try doc.inspectReferences(a, .{});
    for (section.references) |counts| if (!counts.allPresentResolved()) return error.UnresolvedInsertReference;
    const header = try doc.inspectHeaderReferences(a, .{});
    for (header.references) |counts| if (!counts.allPresentResolved()) return error.UnresolvedInsertReference;
    var fonts = try doc.inspectFontReferences(a, .{});
    defer fonts.deinit(a);
    for (fonts.references.references) |counts| if (!counts.allPresentResolved()) return error.UnresolvedInsertReference;
}

fn validateTableReferences(a: std.mem.Allocator, doc: *const package.Document, tree: *const Tree, body: Body) !void {
    if (body.tables == 0) return;
    var header = try doc.inspectHeaderResources(a, .{});
    defer header.deinit(a);
    try static_table.validateDocument(a, tree, &header);
}

const BodyReader = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    limit: usize,
    body: Body = .{},
    used_tables: std.AutoHashMapUnmanaged(u32, void) = .empty,

    fn readParagraph(self: *BodyReader, index: usize, top_level: bool, first: bool) anyerror!void {
        if (self.body.paragraphs == self.limit) return error.LimitExceeded;
        self.body.paragraphs += 1;
        const a = self.a;
        const tree = self.tree;
        const node = tree.elements[index];
        if (!node.is(hp, "p")) return error.UnsupportedInsertBody;
        var attributes = try patch.tag(a, tree, index, &.{ "id", "paraPrIDRef", "styleIDRef", "pageBreak", "columnBreak", "merged" });
        attributes.deinit(a);
        for ([_][]const u8{ "pageBreak", "columnBreak", "merged" }) |name| {
            if (try tree.attributeValue(a, index, "", name)) |raw| {
                if (try @import("table_xml_fields.zig").boolean(a, raw, 32)) return error.UnsupportedInsertBody;
            }
        }
        _ = try patch.number(a, tree, index, "id");
        _ = try patch.number(a, tree, index, "styleIDRef");
        _ = try patch.number(a, tree, index, "paraPrIDRef");
        var run = node.first_child;
        var started = false;
        while (run) |r| : (run = tree.elements[r].next_sibling) {
            const run_node = tree.elements[r];
            if (!run_node.is(hp, "run")) return error.UnsupportedInsertBody;
            var run_attrs = try patch.tag(a, tree, r, &.{"charPrIDRef"});
            run_attrs.deinit(a);
            _ = try patch.number(a, tree, r, "charPrIDRef");
            var content = run_node.first_child;
            while (content) |c| : (content = tree.elements[c].next_sibling) {
                const element = tree.elements[c];
                const leading = first and r == node.first_child.? and !started;
                if (element.is(hp, "t") and element.first_child == null) {
                    var text_attrs = try patch.tag(a, tree, c, &.{});
                    text_attrs.deinit(a);
                    started = true;
                } else if (top_level and element.is(hp, "tbl")) {
                    const id = try patch.number(a, tree, c, "id");
                    if ((try self.used_tables.getOrPut(a, id)).found_existing)
                        return error.DuplicateInsertTableId;
                    const cell_paragraphs = try static_table.read(a, tree, c, self.limit - self.body.paragraphs);
                    self.body.tables += 1;
                    for (cell_paragraphs) |p| try self.readParagraph(p, false, false);
                    started = true;
                } else if (leading and element.is(hp, "secPr") and self.body.section_properties == null and self.body.columns == null) {
                    try validateSectionProperties(a, tree, c);
                    self.body.section_properties = c;
                } else if (leading and element.is(hp, "ctrl") and self.body.columns == null and self.body.section_properties != null) {
                    const col = element.first_child orelse return error.UnsupportedInsertBody;
                    if (!tree.elements[col].is(hp, "colPr") or tree.elements[col].next_sibling != null or tree.elements[col].first_child != null)
                        return error.UnsupportedInsertBody;
                    var control_attrs = try patch.tag(a, tree, c, &.{});
                    control_attrs.deinit(a);
                    var col_attrs = try patch.tag(a, tree, col, &.{ "id", "type", "layout", "colCount", "sameSz", "sameGap" });
                    col_attrs.deinit(a);
                    if (try patch.number(a, tree, col, "colCount") != 1) return error.UnsupportedInsertBody;
                    self.body.columns = c;
                } else return error.UnsupportedInsertBody;
            }
        }
        if (!started) return error.UnsupportedInsertBody;
    }
};

fn readBody(a: std.mem.Allocator, tree: *const Tree, max_paragraphs: usize) !Body {
    if (!tree.elements[0].is(names.section_uri, "sec") or tree.xml_report.processing_instructions != 0)
        return error.UnsupportedInsertBody;
    var reader: BodyReader = .{ .a = a, .tree = tree, .limit = max_paragraphs };
    defer reader.used_tables.deinit(a);
    var roots: std.ArrayList(Root) = .empty;
    var child = tree.elements[0].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const ordinal = reader.body.paragraphs + 1;
        const tables = reader.body.tables;
        try reader.readParagraph(index, true, roots.items.len == 0);
        try roots.append(a, .{ .node = index, .ordinal = ordinal, .has_table = tables != reader.body.tables });
    }
    if (roots.items.len == 0) return error.UnsupportedInsertBody;
    try tree.visitContent(a, .{ .context = @constCast(tree), .on_content = checkContent });
    reader.body.roots = roots.items;
    return reader.body;
}

fn checkContent(raw: *anyopaque, event: Tree.ContentEvent) !void {
    const tree: *const Tree = @ptrCast(@alignCast(raw));
    if (tree.elements[event.parent_index].is(hp, "t")) return;
    const view = event.value.raw;
    if (std.mem.trim(u8, view, " \t\r\n").len != 0) return error.UnsupportedInsertBody;
}

fn validateSectionProperties(a: std.mem.Allocator, tree: *const Tree, index: usize) !void {
    var attrs = try patch.tag(a, tree, index, &.{ "id", "textDirection", "spaceColumns", "tabStopVal", "tabStopUnit", "textVerticalWidthHead", "masterPageCnt" });
    attrs.deinit(a);
    if (try patch.number(a, tree, index, "masterPageCnt") != 0) return error.UnsupportedInsertBody;
    var child = tree.elements[index].first_child;
    while (child) |c| : (child = tree.elements[c].next_sibling) {
        const node = tree.elements[c];
        if (node.is(hp, "pagePr")) {
            var page_attrs = try patch.tag(a, tree, c, &.{ "landscape", "width", "height", "gutterType" });
            page_attrs.deinit(a);
            const margin = node.first_child orelse return error.UnsupportedInsertBody;
            const m = tree.elements[margin];
            if (!m.is(hp, "margin") or m.first_child != null or m.next_sibling != null) return error.UnsupportedInsertBody;
            var margin_attrs = try patch.tag(a, tree, margin, &.{ "left", "right", "top", "bottom", "header", "footer", "gutter" });
            margin_attrs.deinit(a);
            continue;
        }
        if (node.first_child != null) return error.UnsupportedInsertBody;
        const allowed: []const []const u8 = if (node.is(hp, "startNum")) &.{ "pageStartsOn", "page", "pic", "tbl", "equation" } else if (node.is(hp, "grid")) &.{ "lineGrid", "charGrid", "wonggojiFormat" } else if (node.is(hp, "visibility")) &.{ "hideFirstHeader", "hideFirstFooter", "hideFirstMasterPage", "border", "fill", "hideFirstPageNum", "hideFirstEmptyLine", "showLineNumber" } else return error.UnsupportedInsertBody;
        var child_attrs = try patch.tag(a, tree, c, allowed);
        child_attrs.deinit(a);
    }
}

fn equalPrologue(left: *const Tree, lhs: Body, right: *const Tree, rhs: Body) !void {
    for ([_]?usize{ lhs.section_properties, lhs.columns }, [_]?usize{ rhs.section_properties, rhs.columns }) |l, r| {
        if ((l == null) != (r == null)) return error.IncompatibleInsertSectionProperties;
        if (r) |source| {
            const target = l orelse return error.IncompatibleInsertSectionProperties;
            if (!std.mem.eql(u8, left.sourceOf(target), right.sourceOf(source))) return error.IncompatibleInsertSectionProperties;
        }
    }
}

const IdRewrite = struct {
    paragraphs: []const u32,
    tables: []const u32,
    paragraph_cursor: usize = 0,
    table_cursor: usize = 0,
};

fn copyParagraph(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, ids: *IdRewrite, plan: *const resources.Plan, prologue: Body, limit: usize) ![]u8 {
    var changes: std.ArrayList(Change) = .empty;
    const end = tree.elements[paragraph].end;
    for (tree.elements[paragraph..], paragraph..) |node, index| {
        if (node.start_tag.start >= end) break;
        if (node.is(hp, "p")) {
            if (ids.paragraph_cursor >= ids.paragraphs.len) return error.InvalidInsertResult;
            try patch.replaceNumber(a, tree, index, "id", ids.paragraphs[ids.paragraph_cursor], &changes);
            ids.paragraph_cursor += 1;
            try resources.remap(a, tree, index, "paraPrIDRef", plan, .paragraph, &changes);
            try resources.remap(a, tree, index, "styleIDRef", plan, .style, &changes);
        } else if (node.is(hp, "run")) {
            try resources.remap(a, tree, index, "charPrIDRef", plan, .character, &changes);
        } else if (node.is(hp, "tbl") or node.is(hp, "tc") or node.is(hp, "cellzone")) {
            try resources.remap(a, tree, index, "borderFillIDRef", plan, .border_fill, &changes);
            if (node.is(hp, "tbl")) {
                if (ids.table_cursor >= ids.tables.len) return error.InvalidInsertResult;
                try patch.replaceNumber(a, tree, index, "id", ids.tables[ids.table_cursor], &changes);
                ids.table_cursor += 1;
            }
        }
    }
    for ([_]?usize{ prologue.section_properties, prologue.columns }) |node| {
        if (node) |i| try changes.append(a, .{ .start = tree.elements[i].start_tag.start, .end = tree.elements[i].end, .text = "", .serialized_xml = "" });
    }
    return patch.fragment(a, tree, paragraph, changes.items, limit);
}
