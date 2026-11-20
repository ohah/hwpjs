//! Resolve a read observation, not an edit target or a geometry certificate.
//! Format adapters independently derive the actual current display-text axis.
const std = @import("std");
const inventory = @import("document_text_snapshot.zig");
const Binding = @import("formatting_patch.zig").Binding;
const Cursor = @import("../text/utf8_utf16_splice.zig").Cursor;
pub const Request = struct {
    read_stamp: ?@import("document_text_read_binding.zig").Stamp = null,
    binding: Binding,
    ref: []const u8,
    start: u32,
    end: u32,
    expected: []const u8,
};
pub fn validateText(text: []const u8, start: u32, end: u32, expected: []const u8) !void {
    if (start >= end or expected.len == 0) return error.InvalidDocumentTextMatch;
    const units = try @import("independent_text_edits.zig").utf16Units(expected);
    if (units != end - start) return error.ExpectedTextLengthMismatch;
    var cursor: Cursor = .{ .text = text };
    const first = try cursor.seek(start);
    const last = try cursor.seek(end);
    if (!std.mem.eql(u8, text[first..last], expected)) return error.ExpectedTextMismatch;
}
pub fn resolve(snapshot: *const inventory.Snapshot, request: Request) !*const inventory.Row {
    try snapshot.validateComplete();
    if (!std.meta.eql(snapshot.read_binding, request.read_stamp)) return error.StaleDocumentTextReadBinding;
    if (!std.mem.eql(u8, snapshot.binding.session, request.binding.session) or
        snapshot.binding.revision != request.binding.revision) return error.StaleDocumentTextReference;
    const row = try snapshot.rowFor(request.ref);
    try validateText(row.text, request.start, request.end, request.expected);
    return row;
}
pub const Target = union(enum) {
    paragraph: struct { section: u32, paragraph: u32, start: u32, end: u32 },
    created_cell: struct { section: u32, identity: []const u8, row: u32, column: u32, start: u32, end: u32 },
};
pub const Response = struct {
    read_stamp: ?@import("document_text_read_binding.zig").Stamp = null,
    arena: std.heap.ArenaAllocator,
    format: @import("document.zig").Format,
    binding: Binding,
    ref: []const u8,
    expected: []const u8,
    before_text: []const u8,
    target: Target,
    pub fn deinit(self: *Response) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn encode(self: *const Response, a: std.mem.Allocator) ![]u8 {
        return @import("../json/bounded_stringify.zig").encode(a, self, inventory.max_reply_bytes);
    }
    pub fn jsonStringify(self: *const Response, j: *std.json.Stringify) !void {
        try j.beginObject();
        try j.objectField("schemaVersion");
        try j.write(@as(u32, 1));
        try j.objectField("scope");
        try j.write("native-document-text-selection");
        try j.objectField("coordinateSpace");
        try j.write("native-current-text-observation");
        try j.objectField("executionAuthority");
        try j.write(false);
        try j.objectField("format");
        try j.write(@tagName(self.format));
        try j.objectField("binding");
        try j.write(self.binding);
        if (self.read_stamp) |stamp| {
            try j.objectField("readBinding");
            try j.write(stamp);
        }
        try j.objectField("ref");
        try j.write(self.ref);
        try j.objectField("expectedOriginal");
        try j.write(self.expected);
        try j.objectField("beforeText");
        try j.write(self.before_text);
        try j.objectField("target");
        try j.beginObject();
        switch (self.target) {
            .paragraph => |target| {
                try j.objectField("kind");
                try j.write("paragraph");
                try j.objectField("section");
                try j.write(target.section);
                try j.objectField("paragraph");
                try j.write(target.paragraph);
                try j.objectField("startUnit");
                try j.write(target.start);
                try j.objectField("endUnit");
                try j.write(target.end);
            },
            .created_cell => |target| {
                try j.objectField("kind");
                try j.write("created-cell");
                try j.objectField("section");
                try j.write(target.section);
                try j.objectField("identity");
                try j.write(target.identity);
                try j.objectField("row");
                try j.write(target.row);
                try j.objectField("column");
                try j.write(target.column);
                try j.objectField("startUnit");
                try j.write(target.start);
                try j.objectField("endUnit");
                try j.write(target.end);
            },
        }
        try j.endObject();
        try j.endObject();
    }
};
fn own(a: std.mem.Allocator, snapshot: *const inventory.Snapshot, request: Request, before_text: []const u8) !Response {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    if (try @import("independent_text_edits.zig").utf16Units(before_text) > @import("text_transaction.zig").limits.text_units)
        return error.LimitExceeded;
    // Finish allocations before copying arena state into the returned owner.
    const session = try owned.dupe(u8, snapshot.binding.session);
    const ref = try owned.dupe(u8, request.ref);
    const expected = try owned.dupe(u8, request.expected);
    const text = try owned.dupe(u8, before_text);
    return .{ .arena = arena, .read_stamp = request.read_stamp, .format = snapshot.format, .binding = .{ .session = session, .revision = snapshot.binding.revision }, .ref = ref, .expected = expected, .before_text = text, .target = undefined };
}
pub fn paragraph(a: std.mem.Allocator, snapshot: *const inventory.Snapshot, request: Request, current_paragraph: usize, before_text: []const u8, start: u32, end: u32) !Response {
    const row = try resolve(snapshot, request);
    if (row.source != .paragraph) return error.InvalidDocumentTextSelectionKind;
    try validateText(before_text, start, end, request.expected);
    var response = try own(a, snapshot, request, before_text);
    errdefer response.deinit();
    response.target = .{ .paragraph = .{ .section = row.section, .paragraph = std.math.cast(u32, current_paragraph) orelse return error.LimitExceeded, .start = start, .end = end } };
    return response;
}
pub fn cell(a: std.mem.Allocator, snapshot: *const inventory.Snapshot, request: Request, before_text: []const u8) !Response {
    const row = try resolve(snapshot, request);
    if (row.source != .created_cell) return error.InvalidDocumentTextSelectionKind;
    if (!std.mem.eql(u8, row.text, before_text)) return error.SourceBindingMismatch;
    try validateText(before_text, request.start, request.end, request.expected);
    var response = try own(a, snapshot, request, before_text);
    errdefer response.deinit();
    const source = row.source.created_cell;
    response.target = .{ .created_cell = .{ .section = row.section, .identity = try std.fmt.allocPrint(response.arena.allocator(), "{d}", .{source.identity}), .row = source.row, .column = source.column, .start = request.start, .end = request.end } };
    return response;
}
