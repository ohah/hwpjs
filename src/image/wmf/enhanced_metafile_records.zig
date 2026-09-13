const Header = @import("header.zig").Header;
const records = @import("records.zig");
const escape = @import("escape.zig");
const enhanced = @import("enhanced_metafile.zig");

pub const Report = struct {
    candidates: usize,
    conforming: usize,
    nonconforming: usize,
    chunk_bytes: usize,
};

pub fn inspect(bytes: []const u8, header: Header, framing: records.Summary) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .candidates = 0, .conforming = 0, .nonconforming = 0, .chunk_bytes = 0 };
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
        report.conforming += 1;
        report.chunk_bytes += chunk.data.len;
    }
    return report;
}
