const std = @import("std");
const xml = @import("../xml/document.zig");
pub const Source = enum { schema, instance, diff, last_document };
pub const Options = struct {
    document: xml.Options = .{ .validate_namespaces = true },
    max_documents: usize = 4096,
};
pub const Report = struct {
    documents: usize = 0,
    schema: usize = 0,
    instance: usize = 0,
    diff: usize = 0,
    last_document: usize = 0,
    totals: xml.Report = .{},
};
/// Shared across all selected HWP XML payloads, not reset for each storage/stream.
/// WCHAR payloads provide authoritative UTF-16LE encoding. No root/schema meaning.
pub const Budget = struct {
    options: Options,
    report: Report,
    pub fn init(options: Options) !Budget {
        if (options.document.prolog.external_encoding) |encoding| {
            if (encoding != .utf16le) return error.InvalidHwpXmlEncoding;
        }
        return .{ .options = options, .report = .{ .totals = .{ .namespaces_validated = options.document.validate_namespaces } } };
    }
    pub fn inspect(self: *Budget, a: std.mem.Allocator, bytes: []const u8, source: Source) !void {
        if (self.report.documents >= self.options.max_documents) return error.LimitExceeded;
        var local = self.options.document;
        local.prolog.external_encoding = .utf16le;
        local.prolog.input.max_bytes -= self.report.totals.bytes;
        local.prolog.input.max_characters -= self.report.totals.characters;
        inline for (.{ "elements", "events", "attributes", "references" }) |field| {
            @field(local, "max_" ++ field) -= @field(self.report.totals, field);
        }
        const parsed = try xml.inspect(a, bytes, local);
        // Commit counters only after complete XML validation, never on partial error.
        inline for (.{ "bytes", "characters", "events", "elements", "end_tags", "attributes", "references", "text_scalars", "comments", "cdata", "processing_instructions" }) |field| {
            @field(self.report.totals, field) += @field(parsed, field);
        }
        self.report.totals.max_depth = @max(self.report.totals.max_depth, parsed.max_depth);
        self.report.documents += 1;
        switch (source) {
            .schema => self.report.schema += 1,
            .instance => self.report.instance += 1,
            .diff => self.report.diff += 1,
            .last_document => self.report.last_document += 1,
        }
    }
};
