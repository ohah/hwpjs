//! Read-only inverse of a proven current display point. No write target is issued.
const std = @import("std");
const inventory = @import("document_text_snapshot.zig");
const Cursor = @import("../text/utf8_utf16_splice.zig").Cursor;
pub const Target = union(enum) {
    paragraph: struct { paragraph: u32 },
    created_cell: inventory.Cell,
};
pub const Request = struct {
    read_stamp: ?@import("document_text_read_binding.zig").Stamp = null,
    binding: @import("formatting_patch.zig").Binding,
    section: u32,
    target: Target,
    unit: u32,
    before_text: []const u8,
};
pub fn validate(snapshot: *const inventory.Snapshot, request: Request) !void {
    try snapshot.validateComplete();
    if (!std.meta.eql(snapshot.read_binding, request.read_stamp)) return error.StaleDocumentTextReadBinding;
    if (!std.mem.eql(u8, snapshot.binding.session, request.binding.session) or snapshot.binding.revision != request.binding.revision)
        return error.StaleDocumentTextReference;
    if (request.section >= snapshot.coverage.sections.len) return error.InvalidSection;
    const units = try @import("independent_text_edits.zig").utf16Units(request.before_text);
    if (units > @import("text_transaction.zig").limits.text_units) return error.LimitExceeded;
    var cursor: Cursor = .{ .text = request.before_text };
    _ = try cursor.seek(request.unit);
}
pub const Response = struct {
    read_stamp: ?@import("document_text_read_binding.zig").Stamp = null,
    arena: std.heap.ArenaAllocator,
    format: @import("document.zig").Format,
    binding: @import("formatting_patch.zig").Binding,
    ref: []const u8,
    unit: u32,
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
        try j.write("native-document-text-anchor");
        try j.objectField("executionAuthority");
        try j.write(false);
        try j.objectField("coordinateSpace");
        try j.write("native-read-inventory");
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
        try j.objectField("startUnit");
        try j.write(self.unit);
        try j.objectField("endUnit");
        try j.write(self.unit);
        try j.endObject();
    }
};
/// Adapter must derive row and observed unit from its canonical current owner.
/// The row must belong to this exact observation; text equality alone is not ownership.
pub fn respond(a: std.mem.Allocator, snapshot: *const inventory.Snapshot, request: Request, row: *const inventory.Row, current_text: []const u8, observed_unit: u32) !Response {
    try validate(snapshot, request);
    if (row.section != request.section or (try snapshot.rowFor(row.ref)) != row) return error.SourceBindingMismatch;
    if (!std.mem.eql(u8, request.before_text, current_text)) return error.SourceBindingMismatch;
    var cursor: Cursor = .{ .text = row.text };
    _ = try cursor.seek(observed_unit);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const session = try owned.dupe(u8, snapshot.binding.session);
    const ref = try owned.dupe(u8, row.ref);
    return .{ .arena = arena, .read_stamp = request.read_stamp, .format = snapshot.format, .binding = .{ .session = session, .revision = snapshot.binding.revision }, .ref = ref, .unit = observed_unit };
}
