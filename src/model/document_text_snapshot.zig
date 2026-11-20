//! One complete read inventory; no permission filter, edit model or cache.
const std = @import("std");
const lifetime = @import("formatting_binding.zig");
const transaction = @import("text_transaction.zig");
pub const max_reply_bytes = 16 * 1024 * 1024;
pub const Cell = struct { identity: u64, row: u32, column: u32 };
pub const Source = union(enum) { paragraph: usize, created_cell: Cell };
pub const Row = struct {
    ordinal: u32,
    section: u32,
    paragraph: u32,
    ref: []const u8,
    text: []const u8,
    /// Private current model provenance; serialized only by a separate checked
    /// Native target resolver, not granted to a writer by this read response.
    source: Source,
};
const Key = struct { section: u32, source: Source };
const Coordinate = struct { section: usize, paragraph: usize };
pub const Snapshot = struct {
    arena: std.heap.ArenaAllocator,
    format: @import("document.zig").Format,
    issuer: lifetime.State,
    binding: @import("formatting_patch.zig").Binding,
    coverage: transaction.Coverage,
    rows: std.ArrayList(Row) = .empty,
    seen: std.AutoHashMapUnmanaged(Key, usize) = .empty,
    coordinates: std.AutoHashMapUnmanaged(Coordinate, usize) = .empty,
    section_counts: []u32,
    text_units: usize = 0,
    read_domain: @import("document_text_read_domain.zig").Domain = .editor,
    read_binding: ?@import("document_text_read_binding.zig").Stamp = null,

    pub fn init(backing: std.mem.Allocator, format: @import("document.zig").Format, state: lifetime.State, revision: ?u32, coverage: transaction.Coverage) !Snapshot {
        if (revision == std.math.maxInt(u32) or coverage.paragraphs > transaction.limits.snapshot_paragraphs or coverage.sections.len > transaction.limits.sections) return error.LimitExceeded;
        var arena = std.heap.ArenaAllocator.init(backing);
        errdefer arena.deinit();
        const a = arena.allocator();
        const counts = try a.alloc(u32, coverage.sections.len);
        @memset(counts, 0);
        var total: usize = 0;
        for (coverage.sections, 0..) |section, index| {
            if (section.section != index) return error.InvalidDocumentTextCoverage;
            total = std.math.add(usize, total, section.paragraphs) catch return error.LimitExceeded;
        }
        if (total != coverage.paragraphs) return error.IncompleteDocumentTextSnapshot;
        const session = try state.session(a);
        const sections = try a.dupe(transaction.SectionCoverage, coverage.sections);
        return .{
            .arena = arena,
            .format = format,
            .issuer = state,
            .binding = .{ .session = session, .revision = revision },
            .coverage = .{ .sections = sections, .paragraphs = coverage.paragraphs, .created_cell_paragraphs = coverage.created_cell_paragraphs },
            .section_counts = counts,
        };
    }
    pub fn deinit(self: *Snapshot) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn append(self: *Snapshot, section: usize, source: Source, text: []const u8) !void {
        if (section >= self.coverage.sections.len or self.rows.items.len >= self.coverage.paragraphs) return error.InvalidDocumentTextCoverage;
        if (self.section_counts[section] >= self.coverage.sections[section].paragraphs) return error.InvalidDocumentTextCoverage;
        const units = try @import("independent_text_edits.zig").utf16Units(text);
        self.text_units = std.math.add(usize, self.text_units, units) catch return error.LimitExceeded;
        if (self.text_units > transaction.limits.text_units) return error.LimitExceeded;
        const a = self.arena.allocator();
        const key: Key = .{ .section = @intCast(section), .source = source };
        const owner_slot = try self.seen.getOrPut(a, key);
        if (owner_slot.found_existing) return error.DuplicateCurrentTextOwner;
        owner_slot.value_ptr.* = std.math.maxInt(usize);
        const logical = self.section_counts[section];
        try self.coordinates.put(a, .{ .section = section, .paragraph = logical }, self.rows.items.len);
        try self.rows.append(a, .{
            .ordinal = @intCast(self.rows.items.len),
            .section = @intCast(section),
            .paragraph = logical,
            .ref = try @import("document_text_binding.zig").reference(a, self.issuer, self.binding.revision, .{ .section = section, .paragraph = logical }),
            .text = try a.dupe(u8, text),
            .source = source,
        });
        owner_slot.value_ptr.* = self.rows.items.len - 1;
        self.section_counts[section] += 1;
    }
    /// Resolve only within this immutable observation. Call validateComplete
    /// once before admitting a batch, then use this map for each read locator.
    /// This returns private provenance, never a write-policy authorization.
    /// Native FFI attaches its current external authority before publishing/resolving refs.
    pub fn useReadonlyHwp5Domain(self: *Snapshot) !void {
        if (self.format != .hwp5 or self.binding.revision != null or self.read_binding != null)
            return error.InvalidDocumentTextReadDomain;
        if (self.read_domain == .readonly_hwp5) return;
        const value = try @import("document_text_read_domain.zig").session(self.arena.allocator(), self.issuer, .readonly_hwp5);
        self.binding.session = value;
        self.read_domain = .readonly_hwp5;
    }
    pub fn bindReadStamp(self: *Snapshot, stamp: @import("document_text_read_binding.zig").Stamp) !void {
        try self.validateComplete();
        if (!self.issuer.opened or stamp.epoch == 0 or stamp.epoch != self.issuer.epoch) return error.StaleDocumentTextReadBinding;
        if (self.read_binding) |prior| {
            if (!std.meta.eql(prior, stamp)) return error.StaleDocumentTextReadBinding;
            return;
        }
        const refs = try self.arena.allocator().alloc([]const u8, self.rows.items.len);
        for (self.rows.items, refs) |row, *ref| ref.* = try @import("document_text_read_domain.zig").reference(self.arena.allocator(), self.issuer, self.binding.revision, .{ .section = row.section, .paragraph = row.paragraph }, stamp.serial, self.read_domain);
        for (self.rows.items, refs) |*row, ref| row.ref = ref;
        self.read_binding = stamp;
    }
    pub fn rowFor(self: *const Snapshot, ref: []const u8) !*const Row {
        const owner = if (self.read_binding) |stamp| try @import("document_text_read_domain.zig").resolve(self.issuer, self.binding.revision, stamp.serial, ref, self.read_domain) else try @import("document_text_binding.zig").resolve(self.issuer, self.binding.revision, ref);
        const index = self.coordinates.get(.{ .section = owner.section, .paragraph = owner.paragraph }) orelse return error.InvalidDocumentTextReference;
        const row = &self.rows.items[index];
        if (!std.mem.eql(u8, row.ref, ref)) return error.InvalidDocumentTextReference;
        return row;
    }
    /// Private Native source lookup, independent of the serialized inventory ordinal.
    /// Complete observation admission must precede lookup; no sparse-id range scan.
    pub fn rowForSource(self: *const Snapshot, section: u32, source: Source) !*const Row {
        const index = self.seen.get(.{ .section = section, .source = source }) orelse return error.InvalidDocumentTextReference;
        if (index >= self.rows.items.len) return error.IncompleteDocumentTextSnapshot;
        const row = &self.rows.items[index];
        if (row.section != section or !std.meta.eql(row.source, source)) return error.SourceBindingMismatch;
        return row;
    }
    pub fn validateComplete(self: *const Snapshot) !void {
        if (self.rows.items.len != self.coverage.paragraphs) return error.IncompleteDocumentTextSnapshot;
        for (self.section_counts, self.coverage.sections) |actual, expected| if (actual != expected.paragraphs) return error.IncompleteDocumentTextSnapshot;
        var created: usize = 0;
        for (self.rows.items) |row| if (row.source == .created_cell) {
            created += 1;
        };
        if (created != self.coverage.created_cell_paragraphs) return error.IncompleteDocumentTextSnapshot;
    }
    pub fn encode(self: *const Snapshot, a: std.mem.Allocator) ![]u8 {
        try self.validateComplete();
        return @import("../json/bounded_stringify.zig").encode(a, self, max_reply_bytes);
    }
    pub fn jsonStringify(self: *const Snapshot, j: *std.json.Stringify) !void {
        try j.beginObject();
        try j.objectField("schemaVersion");
        try j.write(@as(u32, 1));
        try j.objectField("scope");
        try j.write("native-document-text");
        try j.objectField("complete");
        try j.write(true);
        try j.objectField("format");
        try j.write(@tagName(self.format));
        try j.objectField("binding");
        try j.write(self.binding);
        if (self.read_binding) |stamp| {
            try j.objectField("readBinding");
            try j.write(stamp);
        }
        try j.objectField("coverage");
        try j.beginObject();
        try j.objectField("totalParagraphs");
        try j.write(self.coverage.paragraphs);
        try j.objectField("sections");
        try j.beginArray();
        for (self.coverage.sections) |row| try j.write(.{ .section = row.section, .paragraphCount = row.paragraphs });
        try j.endArray();
        try j.endObject();
        try j.objectField("rows");
        try j.beginArray();
        for (self.rows.items) |row| try j.write(.{ .ordinal = row.ordinal, .section = row.section, .paragraph = row.paragraph, .ref = row.ref, .text = row.text });
        try j.endArray();
        try j.endObject();
    }
};

test "document text search complete Native snapshot includes source and generated cell without a write-policy filter" {
    const a = std.testing.allocator;
    var state: lifetime.State = .{};
    try state.open();
    var snapshot = try Snapshot.init(a, .hwpx, state, 7, .{ .sections = &.{.{ .section = 0, .paragraphs = 2 }}, .paragraphs = 2, .created_cell_paragraphs = 1 });
    defer snapshot.deinit();
    try snapshot.append(0, .{ .paragraph = 999 }, "머리말 😀");
    try std.testing.expectError(error.IncompleteDocumentTextSnapshot, snapshot.validateComplete());
    try snapshot.append(0, .{ .created_cell = .{ .identity = 9, .row = 0, .column = 0 } }, "생성 셀");
    try snapshot.validateComplete();
    try std.testing.expectEqualDeep(Source{ .paragraph = 999 }, (try snapshot.rowFor(snapshot.rows.items[0].ref)).source);
    try std.testing.expectEqualDeep(Source{ .created_cell = .{ .identity = 9, .row = 0, .column = 0 } }, (try snapshot.rowFor(snapshot.rows.items[1].ref)).source);
    const absent_ref = try @import("document_text_binding.zig").reference(a, state, 7, .{ .section = 0, .paragraph = 0xfffffffe });
    defer a.free(absent_ref);
    try std.testing.expectError(error.InvalidDocumentTextReference, snapshot.rowFor(absent_ref));
    const bytes = try snapshot.encode(a);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const rows = parsed.value.object.get("rows").?.array.items;
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqualStrings("생성 셀", rows[1].object.get("text").?.string);
    try std.testing.expect(rows[0].object.get("source") == null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(backing: std.mem.Allocator, issuer: lifetime.State) !void {
            var value = try Snapshot.init(backing, .hwpx, issuer, 7, .{ .sections = &.{.{ .section = 0, .paragraphs = 2 }}, .paragraphs = 2, .created_cell_paragraphs = 1 });
            defer value.deinit();
            try value.append(0, .{ .paragraph = 999 }, "머리말 😀");
            try value.append(0, .{ .created_cell = .{ .identity = 9, .row = 0, .column = 0 } }, "생성 셀");
            const encoded = try value.encode(backing);
            defer backing.free(encoded);
        }
    }.run, .{state});
}
