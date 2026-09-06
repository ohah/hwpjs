const std = @import("std");
const parameters = @import("parser.zig");
const references = @import("references.zig");
const record = @import("../record.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const lists = @import("../body/table_lists.zig");
const table_id = @import("../body/control_rules.zig").table_id;
const bookmark = @import("../body/bookmark.zig");
pub const Options = struct { parameters: parameters.Options, list_layout: body.list_header.Layout, bin_data_count: usize, framing: record.Options = .{} };
/// Independent diagnostic axes: do not sum these into a "complete" count.
pub const Report = struct {
    doc_payloads: usize = 0,
    control_payloads: usize = 0,
    cell_payloads: usize = 0,
    parsed: usize = 0,
    unsupported: usize = 0,
    unsupported_bytes: usize = 0,
    nodes: usize = 0,
    binary_refs: usize = 0, // Inspected IDs, including contextual inactive absence; not resolved streams.
    cell_names: usize = 0,
    unknown_cell_sets: usize = 0,
    opaque_cell_extensions: usize = 0,
    trailing_payloads: usize = 0,
    trailing_bytes: usize = 0,
};
const Role = enum { document, control, cell };
fn consume(a: std.mem.Allocator, bytes: []const u8, role: Role, options: Options, report: *Report, bookmarks: ?*bookmark.Report, context: references.Context) !void {
    switch (role) {
        .document => report.doc_payloads += 1,
        .control => report.control_payloads += 1,
        .cell => report.cell_payloads += 1,
    }
    var doc = parameters.Document.parse(a, bytes, options.parameters) catch |err| {
        if (err != error.UnsupportedParameterType) return err;
        // No per-item length exists for an unknown type; retain the whole source.
        report.unsupported += 1;
        report.unsupported_bytes += bytes.len;
        if (bookmarks) |b| b.unsupported += 1;
        return;
    };
    defer doc.deinit(a);
    report.binary_refs += try references.validateInContext(doc, options.bin_data_count, context);
    if (bookmarks) |b| try bookmark.consume(b, doc);
    if (role == .cell) {
        const field = try body.cell_field.fromDocument(doc);
        if (!field.recognized_set) report.unknown_cell_sets += 1;
        if (field.field_name_utf16 != null) report.cell_names += 1;
    }
    report.parsed += 1;
    report.nodes += doc.nodes.len;
    if (doc.extra.len > 0) {
        report.trailing_payloads += 1;
        report.trailing_bytes += doc.extra.len;
    }
}
/// Reads tag 27 only; other DocInfo semantics remain with their own validators.
pub fn inspectDocInfo(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    try options.parameters.validate();
    var report: Report = .{};
    var it = record.Iterator.init(bytes, options.framing);
    while (try it.next()) |r| if (r.tag == 27) try consume(a, r.payload, .document, options, &report, null, .unknown);
    return report;
}
/// Uses a validated tree and selected list layout with the observed cell prefix.
/// Only direct bookmark ControlData gets named-field semantics. Other control
/// ownership/Set IDs remain deferred; a missing ControlData is not a fake name.
pub fn inspectBody(a: std.mem.Allocator, tree: Tree, options: Options) !Report {
    return (try inspectBodyDetailed(a, tree, options)).parameters;
}
pub const BodyReport = struct { parameters: Report, bookmarks: bookmark.Report };
pub fn inspectBodyDetailed(a: std.mem.Allocator, tree: Tree, options: Options) !BodyReport {
    try options.parameters.validate();
    var report: Report = .{};
    var bookmarks: bookmark.Report = .{};
    for (tree.nodes, 0..) |node, index| {
        if (bookmark.isControl(node)) {
            bookmarks.controls += 1;
            bookmarks.header_extra_bytes += node.record.value.control_header.properties.len;
        }
        if (node.record.framing.tag == 87) {
            const owned = bookmark.owns(tree, index);
            if (owned) bookmarks.control_data += 1;
            const context: references.Context = if (node.parent) |p| blk: {
                const value = tree.nodes[p].record.value;
                break :blk if (value == .control_header and value.control_header.id == @import("../body/control_rules.zig").id("secd")) .section_control else .unknown;
            } else .unknown;
            try consume(a, node.record.framing.payload, .control, options, &report, if (owned) &bookmarks else null, context);
        }
        if (node.record.value != .control_header or node.record.value.control_header.id != table_id) continue;
        var it = try lists.Iterator.init(tree, index);
        while (it.next()) |entry| {
            if (entry.kind != .cell) continue;
            const view = try tree.nodes[entry.node].record.value.list_header.view(options.list_layout);
            const cell = try body.Cell.parse(view.extra);
            const ext = try body.CellExtension.parse(cell.extra);
            if (ext.parameterSetMarked()) {
                try consume(a, ext.remaining, .cell, options, &report, null, .unknown);
            } else if (ext.remaining.len > 0 or (ext.marker != null and ext.marker.? != 0)) {
                report.opaque_cell_extensions += 1;
            }
        }
    }
    return .{ .parameters = report, .bookmarks = bookmarks };
}
