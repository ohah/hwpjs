//! Private whole-file SOURCE grid candidate. No live session or publication.
const std = @import("std");
const package = @import("package.zig");
const grid = @import("source_table_grid.zig");
const xml = @import("document_xml.zig");
const attrs = @import("xml_attributes.zig");
pub const Command = grid.Command;
pub const Target = grid.Target;
pub const Request = struct {
    section: usize,
    target: Target,
    expected_rows: u32,
    expected_columns: u32,
    command: Command,
};
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 64 * 1024 * 1024,
    max_total_payload_bytes: usize = 256 * 1024 * 1024,
    max_parts: usize = 4096,
    max_sections: usize = 4096,
    max_nodes: usize = 1_000_000,
    max_paragraphs: usize = 1_000_000,
    max_cells: usize = 4096,
};
const Inventory = struct {
    a: std.mem.Allocator,
    used: std.AutoHashMapUnmanaged(u32, void) = .empty,
    count: usize = 0,
    limit: usize,
    fn onTag(raw: *anyopaque, tag: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, _: usize) anyerror!void {
        const self: *Inventory = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        const name = try scope.expandElement(tag.name);
        if (std.mem.eql(u8, name.uri, "http://www.w3.org/2000/09/xmldsig#")) return error.SignedDocument;
        if (!try attrs.element(tag, scope, xml.paragraph_uri, "p")) return;
        if (self.count == self.limit) return error.LimitExceeded;
        self.count += 1;
        const value = try attrs.attribute(self.a, tag, scope, "id", 4096) orelse return;
        defer self.a.free(value);
        _ = try @import("xml_values.zig").nonNegative(value);
        const id = @import("xml_values.zig").unsigned32(value) catch |err| switch (err) {
            error.InvalidUnsigned32 => return,
            else => return err,
        };
        // Paragraph identity is independent of resource/object IDs.
        try self.used.put(self.a, id, {});
    }
};
fn xmlMediaType(media: []const u8) bool {
    return std.mem.eql(u8, media, "application/xml") or std.mem.eql(u8, media, "text/xml") or std.mem.endsWith(u8, media, "+xml");
}
// Entry indices are resolved by the package parser using exact ZIP paths.
// Visit each manifest item once; never search the manifest per archive entry.
fn xmlEntries(a: std.mem.Allocator, d: *const package.Document) ![]bool {
    const marked = try a.alloc(bool, d.archive.entries.len);
    errdefer a.free(marked);
    @memset(marked, false);
    for (d.manifest.items) |item| {
        if (!xmlMediaType(item.media_type)) continue;
        const index = item.entry_index orelse return error.ExternalSpineXml;
        marked[index] = true;
    }
    for (d.archive.entries, marked) |entry, *is_xml| {
        for ([_][]const u8{ ".xml", ".hpf", ".rdf" }) |suffix| {
            if (entry.name.len >= suffix.len and std.ascii.eqlIgnoreCase(entry.name[entry.name.len - suffix.len ..], suffix)) {
                is_xml.* = true;
                break;
            }
        }
    }
    return marked;
}
fn inspect(a: std.mem.Allocator, d: *const package.Document, options: Options, inventory: *Inventory) !void {
    if (d.archive.entries.len > options.max_parts) return error.LimitExceeded;
    var remaining = options.max_total_xml_bytes;
    var payload = options.max_total_payload_bytes;
    var nodes = options.max_nodes;
    const xml_entries = try xmlEntries(a, d);
    defer a.free(xml_entries);
    for (d.archive.entries, xml_entries) |entry, is_xml| {
        const limit = if (is_xml) @min(payload, @min(remaining, options.max_xml_bytes)) else payload;
        const bytes = try d.archive.decode(entry, limit);
        defer a.free(bytes);
        payload -= bytes.len;
        if (!is_xml) continue;
        remaining -= bytes.len;
        const report = try xml.visitBytes(a, bytes, options.max_xml_bytes, .{ .max_elements = nodes }, .{ .context = inventory, .on_tag = Inventory.onTag });
        nodes -= report.elements;
    }
}
fn open(a: std.mem.Allocator, input: []const u8, options: Options) !package.Document {
    return package.inspectDocument(a, input, .{ .zip = .{ .max_entries = options.max_parts, .max_entry_bytes = options.max_total_payload_bytes } });
}
fn structureOptions(options: Options) package.StructureOptions {
    return .{ .max_sections = options.max_sections, .max_header_xml_bytes = options.max_xml_bytes, .max_spine_xml_bytes = options.max_xml_bytes, .max_total_xml_bytes = options.max_total_xml_bytes, .xml = .{ .max_elements = options.max_nodes } };
}
/// Borrow input; return a newly owned ZIP only after package/payload/XML reopen.
/// IDs are reserved in a temporary package-wide paragraph-only inventory.
pub fn transform(a: std.mem.Allocator, input: []const u8, request: Request, options: Options) ![]u8 {
    if (input.len == 0 or input.len > options.max_input_bytes) return error.LimitExceeded;
    var d = try open(a, input, options);
    defer d.deinit(a);
    try @import("file_transform_security.zig").validate(a, &d, options.max_xml_bytes);
    var inventory: Inventory = .{ .a = a, .limit = options.max_paragraphs };
    defer inventory.used.deinit(a);
    try inspect(a, &d, options, &inventory);
    var structure = try d.inspectStructure(a, structureOptions(options));
    defer structure.deinit(a);
    if (request.section >= structure.sections.len) return error.InvalidSectionIndex;
    const item = structure.sections[request.section].item_index;
    const entry = d.manifest.items[item].entry_index orelse return error.ExternalSpineXml;
    const source = try d.archive.decode(d.archive.entries[entry], options.max_xml_bytes);
    defer a.free(source);
    const plan = try @import("../model/table_grid_edit_plan.zig").create(request.expected_rows, request.expected_columns, request.command, options.max_cells);
    if (plan.inserted_count > options.max_paragraphs - inventory.count) return error.LimitExceeded;
    const ids = try a.alloc(u32, plan.inserted_count);
    defer a.free(ids);
    var next: u32 = 1;
    for (ids) |*id| {
        while (inventory.used.contains(next)) next = std.math.add(u32, next, 1) catch return error.LimitExceeded;
        id.* = next;
        try inventory.used.put(a, next, {});
    }
    const candidate = try grid.prepare(a, source, .{ .target = request.target, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .command = request.command, .fresh_paragraph_ids = ids, .max_bytes = options.max_xml_bytes, .max_cells = options.max_cells });
    defer a.free(candidate);
    const output = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry, .bytes = candidate }}, .{ .read = .{ .max_entries = options.max_parts, .max_entry_bytes = options.max_total_payload_bytes }, .max_output_bytes = options.max_output_bytes });
    errdefer a.free(output);
    var reopened = try open(a, output, options);
    defer reopened.deinit(a);
    var check: Inventory = .{ .a = a, .limit = options.max_paragraphs };
    defer check.used.deinit(a);
    try inspect(a, &reopened, options, &check);
    var reopened_structure = try reopened.inspectStructure(a, structureOptions(options));
    defer reopened_structure.deinit(a);
    if (reopened_structure.sections.len != structure.sections.len) return error.SourceTableFileValidationFailed;
    // An archive index belongs to its own Document. Resolve the section again
    // rather than relying on the replacement writer's current central order.
    const reopened_item = reopened.manifest.items[reopened_structure.sections[request.section].item_index];
    if (!std.mem.eql(u8, reopened_item.href, d.manifest.items[item].href)) return error.SourceTableFileValidationFailed;
    const reopened_entry = reopened_item.entry_index orelse return error.ExternalSpineXml;
    const saved = try reopened.archive.decode(reopened.archive.entries[reopened_entry], options.max_xml_bytes);
    defer a.free(saved);
    if (!std.mem.eql(u8, saved, candidate)) return error.SourceTableFileValidationFailed;
    return output;
}
