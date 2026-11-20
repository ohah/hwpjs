//! Native-issued creation owner provenance. No Surface-only authority.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Binding = struct { session: []const u8, revision: u32, serial: []const u8 };
pub const Kind = enum { body, sourceCell, createdCell };
pub const Owner = struct {
    kind: Kind,
    binding: Binding,
    table_node: ?usize = null,
    list_node: ?usize = null,
    identity: ?[]const u8 = null,
    row: ?u32 = null,
    column: ?u32 = null,
};
pub const CreatedCell = struct { identity: []const u8, row: u32, column: u32 };
pub const Selector = struct { section: usize, paragraph: ?usize = null, created_cell: ?CreatedCell = null };
pub const Observation = struct {
    owner: Owner,
    text: []u8,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        a.free(self.text);
        self.* = undefined;
    }
};

pub fn wireUnsigned(value: std.json.Value) !void {
    if (value != .integer or value.integer < 0 or value.integer > std.math.maxInt(u32)) return error.InvalidInlineObjectOwner;
}
fn object(value: std.json.Value, count: usize) !void {
    if (value != .object or value.object.count() != count) return error.InvalidInlineObjectOwner;
}
fn field(value: std.json.Value, key: []const u8) !std.json.Value {
    if (value != .object) return error.InvalidInlineObjectOwner;
    return value.object.get(key) orelse error.InvalidInlineObjectOwner;
}
fn decimal(value: std.json.Value, positive: bool) !void {
    if (value != .string) return error.InvalidInlineObjectOwner;
    const number = try @import("../model/formatting_binding.zig").decimal(value.string);
    if (positive and number == 0) return error.InvalidInlineObjectOwner;
}
pub fn wireOwner(value: std.json.Value) !Kind {
    const kind = try field(value, "kind");
    if (kind != .string) return error.InvalidInlineObjectOwner;
    const parsed = std.meta.stringToEnum(Kind, kind.string) orelse return error.InvalidInlineObjectOwner;
    try object(value, switch (parsed) {
        .body => 2,
        .sourceCell => 4,
        .createdCell => 5,
    });
    const binding = try field(value, "binding");
    try object(binding, 3);
    const session = try field(binding, "session");
    if (session != .string or session.string.len < 2 or session.string[0] != 's') return error.InvalidInlineObjectOwner;
    try decimal(.{ .string = session.string[1..] }, true);
    try decimal(try field(binding, "serial"), false);
    try wireUnsigned(try field(binding, "revision"));
    switch (parsed) {
        .body => {},
        .sourceCell => {
            try wireUnsigned(try field(value, "table_node"));
            try wireUnsigned(try field(value, "list_node"));
        },
        .createdCell => {
            try decimal(try field(value, "identity"), true);
            try wireUnsigned(try field(value, "row"));
            try wireUnsigned(try field(value, "column"));
        },
    }
    return parsed;
}

pub fn wireAddress(value: std.json.Value) !?Kind {
    try wireUnsigned(try field(value, "section"));
    const kind = if (value.object.get("owner")) |owner| try wireOwner(owner) else null;
    if (kind == .createdCell) {
        if (value.object.contains("paragraph")) return error.InvalidInlineObjectOwner;
    } else {
        const paragraph = try field(value, "paragraph");
        try wireUnsigned(paragraph);
        if (paragraph.integer == 0) return error.InvalidParagraphIndex;
    }
    if (kind == null and (try field(value, "section")).integer != 0) return error.InlineObjectOwnerRequired;
    if (value.object.get("affinity")) |affinity| {
        if (kind == null or affinity != .string or (!std.mem.eql(u8, affinity.string, "forward") and !std.mem.eql(u8, affinity.string, "backward"))) return error.InvalidInlineObjectOwner;
    }
    return kind;
}

pub fn current(session: *const editor.Session, selector: Selector, binding: Binding) !Observation {
    if (selector.section >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const section = &session.sections[selector.section];
    if (selector.created_cell) |cell| {
        if (selector.paragraph != null) return error.InvalidInlineObjectOwner;
        const identity = try @import("../model/formatting_binding.zig").decimal(cell.identity);
        if (identity == 0) return error.InvalidCreatedTableIdentity;
        var found: ?*const @import("../model/created_table.zig").Table = null;
        for (section.created_tables.entries.items) |*entry| if (entry.table.identity == identity) {
            if (found != null) return error.SourceBindingMismatch;
            found = &entry.table;
        };
        const table = found orelse return error.InvalidCreatedTableIdentity;
        _ = try table.plan.cell(cell.row, cell.column);
        const index = @as(usize, cell.row) * table.plan.columns + cell.column;
        if (index >= table.cells.len) return error.SourceBindingMismatch;
        return .{ .owner = .{ .kind = .createdCell, .binding = binding, .identity = cell.identity, .row = cell.row, .column = cell.column }, .text = try a.dupe(u8, table.cells[index].text) };
    }
    const paragraph = selector.paragraph orelse return error.InvalidParagraphIndex;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    if (paragraph < section.first_paragraph or paragraph - section.first_paragraph >= view.paragraphs.len) return error.InvalidParagraphIndex;
    const p = view.paragraphs[paragraph - section.first_paragraph];
    try @import("inline_object_owner.zig").validate(a, &section.tree, p.template_element);
    const cell = try @import("table_display_owner.zig").resolve(a, &section.tree, p.template_element);
    return .{ .owner = if (cell) |c| .{ .kind = .sourceCell, .binding = binding, .table_node = c.table_node, .list_node = c.list_node } else .{ .kind = .body, .binding = binding }, .text = try session.anchorText(selector.section, paragraph) };
}

/// Re-resolve the claimed owner against live Native state. Strings/coordinates
/// are merely lookup keys; ABI must separately check epoch/revision/serial.
pub fn checkCurrent(session: *const editor.Session, section: usize, paragraph: usize, owner: Owner, text: []const u8) !void {
    var observed = try current(session, .{ .section = section, .paragraph = if (owner.kind == .createdCell) null else paragraph, .created_cell = if (owner.kind == .createdCell) .{ .identity = owner.identity orelse return error.InvalidInlineObjectOwner, .row = owner.row orelse return error.InvalidInlineObjectOwner, .column = owner.column orelse return error.InvalidInlineObjectOwner } else null }, owner.binding);
    defer observed.deinit(session.allocator);
    if (owner.kind != observed.owner.kind or owner.table_node != observed.owner.table_node or owner.list_node != observed.owner.list_node or !std.mem.eql(u8, observed.text, text)) return error.SourceBindingMismatch;
}
