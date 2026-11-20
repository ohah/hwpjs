//! Immutable HWP5 read ownership, independent from editable Session/History.
//! Source parsing and text projection retain their existing bounded SSOTs.
const std = @import("std");
const Source = @import("text_source.zig").Source;
const Document = @import("../model/document.zig").Document;
const Snapshot = @import("../model/document_text_snapshot.zig").Snapshot;
const Binding = @import("../model/formatting_binding.zig").State;
const Stamp = @import("../model/document_text_read_binding.zig").Stamp;
const tx = @import("../model/text_transaction.zig");
const Values = @import("edit/created_table_values.zig").Values;
const max_input = 64 * 1024 * 1024;
const max_decoded = 64 * 1024 * 1024;
const max_stream = 32 * 1024 * 1024;

const State = struct {
    allocator: std.mem.Allocator,
    issuer_epoch: u64,
    source: Source,
    decoded: [][]u8,
    document: Document,
    empty_tables: []Values,
    coverage: tx.Coverage,
};

/// Opaque ownership prevents callers from mutating the read model. This type
/// deliberately has no save/apply/History API and never opens an edit Session.
pub const Owner = opaque {
    fn state(self: *const Owner) *const State {
        return @ptrCast(@alignCast(self));
    }
    pub fn open(a: std.mem.Allocator, input: []const u8, issuer: Binding) !*Owner {
        if (!issuer.opened or issuer.epoch == 0) return error.EditorNotOpen;
        if (input.len > max_input) return error.LimitExceeded;
        var source = try Source.openReadOnly(a, input);
        errdefer source.deinit();
        const decoded = try a.alloc([]u8, source.section_count);
        errdefer a.free(decoded);
        var count: usize = 0;
        errdefer for (decoded[0..count]) |bytes| a.free(bytes);
        var total_bytes: usize = 0;
        for (decoded, 0..) |*bytes, section| {
            bytes.* = try source.decodeSection(a, section);
            count += 1;
            total_bytes = std.math.add(usize, total_bytes, bytes.len) catch return error.LimitExceeded;
            if (bytes.len > max_stream or total_bytes > max_decoded) return error.LimitExceeded;
        }
        var document = try @import("model_projection.zig").fromDecodedSections(a, source.header.version(), decoded);
        errdefer document.deinit(a);
        if (document.sections.len != decoded.len or document.sections.len > tx.limits.sections)
            return error.SourceBindingMismatch;
        const tables = try a.alloc(Values, document.sections.len);
        errdefer a.free(tables);
        for (tables) |*table| table.* = .{};
        const sections = try a.alloc(tx.SectionCoverage, document.sections.len);
        errdefer a.free(sections);
        var total: usize = 0;
        for (document.sections, sections, 0..) |section, *row, index| {
            total = std.math.add(usize, total, section.paragraphs.len) catch return error.LimitExceeded;
            if (total > tx.limits.snapshot_paragraphs) return error.LimitExceeded;
            row.* = .{ .section = @intCast(index), .paragraphs = @intCast(section.paragraphs.len) };
        }
        // Allocate the stable owner after all fallible owned fields, rather
        // than moving an arena whose allocator escaped through local storage.
        const owned = try a.create(State);
        owned.* = .{ .allocator = a, .issuer_epoch = issuer.epoch, .source = source, .decoded = decoded, .document = document, .empty_tables = tables, .coverage = .{ .sections = sections, .paragraphs = @intCast(total), .created_cell_paragraphs = 0 } };
        return @ptrCast(owned);
    }
    pub fn close(self: *Owner) void {
        const owned: *State = @ptrCast(@alignCast(self));
        const a = owned.allocator;
        a.free(owned.coverage.sections);
        a.free(owned.empty_tables);
        owned.document.deinit(a);
        for (owned.decoded) |bytes| a.free(bytes);
        a.free(owned.decoded);
        owned.source.deinit();
        a.destroy(owned);
    }
    /// The caller supplies its actual current external authority. This owner
    /// cannot issue/relabel a generation or authorize a mutation/history lease.
    pub fn snapshot(self: *const Owner, a: std.mem.Allocator, issuer: Binding, current: Stamp) !Snapshot {
        const s = self.state();
        if (!issuer.opened or issuer.epoch != s.issuer_epoch or current.epoch != s.issuer_epoch)
            return error.StaleDocumentTextReadBinding;
        var result = try @import("edit/document_text_snapshot.zig").read(a, &s.document, s.empty_tables, s.decoded, s.source.header.version(), issuer, null, s.coverage);
        errdefer result.deinit();
        try result.useReadonlyHwp5Domain();
        try result.bindReadStamp(current);
        return result;
    }
    pub fn selection(self: *const Owner, a: std.mem.Allocator, issuer: Binding, current: Stamp, request: @import("../model/document_text_selection.zig").Request) !@import("../model/document_text_selection.zig").Response {
        try @import("../model/document_text_read_binding.zig").assertCurrent(request.read_stamp, issuer, current.serial, null);
        if (current.epoch != issuer.epoch) return error.StaleDocumentTextReadBinding;
        var observed = try self.snapshot(a, issuer, current);
        defer observed.deinit();
        const s = self.state();
        return @import("edit/document_text_selection.zig").query(a, &s.document, s.empty_tables, &observed, request);
    }
    pub fn anchor(self: *const Owner, a: std.mem.Allocator, issuer: Binding, current: Stamp, request: @import("../model/document_text_anchor.zig").Request) !@import("../model/document_text_anchor.zig").Response {
        try @import("../model/document_text_read_binding.zig").assertCurrent(request.read_stamp, issuer, current.serial, null);
        if (current.epoch != issuer.epoch) return error.StaleDocumentTextReadBinding;
        var observed = try self.snapshot(a, issuer, current);
        defer observed.deinit();
        const s = self.state();
        return @import("edit/document_text_anchor.zig").query(a, &s.document, s.empty_tables, &observed, request);
    }
};
