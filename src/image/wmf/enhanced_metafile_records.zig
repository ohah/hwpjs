const std = @import("std");
const Header = @import("header.zig").Header;
const records = @import("records.zig");
const escape = @import("escape.zig");
const enhanced = @import("enhanced_metafile.zig");
const sequence = @import("enhanced_metafile_sequence.zig");

pub const Options = struct {
    max_records_per_sequence: usize,
    max_bytes_per_sequence: usize,
};

pub const Report = struct {
    candidates: usize,
    conforming: usize,
    nonconforming: usize,
    chunk_bytes: usize,
    sequences: usize,
};

pub fn inspect(a: std.mem.Allocator, bytes: []const u8, header: Header, framing: records.Summary, options: Options) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .candidates = 0, .conforming = 0, .nonconforming = 0, .chunk_bytes = 0, .sequences = 0 };
    while (try iterator.next()) |record| {
        if (record.function != 0x0626) continue;
        const escaped = try escape.parse(record);
        if (escaped.function_raw != 0x000f) continue;
        report.candidates += 1;
        const chunk = enhanced.parse(record) catch |err| {
            if (!enhanced.isConformanceError(err)) return err;
            report.nonconforming += 1;
            continue;
        };
        const count: usize = chunk.record_count;
        if (count > options.max_records_per_sequence) return error.LimitExceeded;
        if (count > framing.count) return error.InvalidWmfEnhancedMetafileSequenceCount;
        const chunks = try a.alloc(enhanced.Chunk, count);
        defer a.free(chunks);
        chunks[0] = chunk;
        report.conforming += 1;
        for (1..count) |index| {
            const next = (try iterator.next()) orelse return error.MissingWmfEnhancedMetafileChunk;
            if (next.function != 0x0626) return error.NonconsecutiveWmfEnhancedMetafileChunk;
            const next_escape = try escape.parse(next);
            if (next_escape.function_raw != 0x000f) return error.NonconsecutiveWmfEnhancedMetafileChunk;
            report.candidates += 1;
            chunks[index] = try enhanced.parse(next);
            report.conforming += 1;
        }
        const summary = try sequence.validate(chunks, options.max_bytes_per_sequence);
        report.chunk_bytes += summary.bytes;
        report.sequences += 1;
    }
    return report;
}
