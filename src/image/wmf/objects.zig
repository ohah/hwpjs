const std = @import("std");
const Header = @import("header.zig").Header;
const records = @import("records.zig");

pub const Report = struct {
    creates: usize,
    selects: usize,
    deletes: usize,
    peak_live: usize,
    final_live: usize,
};

fn isCreate(function: u16) bool {
    return switch (function) {
        0x00f7, // META_CREATEPALETTE
        0x0142, // META_DIBCREATEPATTERNBRUSH
        0x01f9, // META_CREATEPATTERNBRUSH
        0x02fa, // META_CREATEPENINDIRECT
        0x02fb, // META_CREATEFONTINDIRECT
        0x02fc, // META_CREATEBRUSHINDIRECT
        0x06ff, // META_CREATEREGION
        => true,
        else => false,
    };
}

fn isReference(function: u16) bool {
    return switch (function) {
        0x012c, // META_SELECTCLIPREGION
        0x012d, // META_SELECTOBJECT
        0x0234, // META_SELECTPALETTE
        => true,
        else => false,
    };
}

/// Replays only WMF Object Table allocation, reference, deletion and reuse.
/// Callers first validate generic framing and pass its EOF boundary.
pub fn validate(a: std.mem.Allocator, bytes: []const u8, header: Header, framing: records.Summary) !Report {
    const slot_count: usize = header.meta.number_of_objects;
    var live = try std.DynamicBitSetUnmanaged.initEmpty(a, slot_count);
    defer live.deinit(a);
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .creates = 0, .selects = 0, .deletes = 0, .peak_live = 0, .final_live = 0 };
    while (try iterator.next()) |record| {
        if (isCreate(record.function)) {
            var index: usize = 0;
            while (index < slot_count and live.isSet(index)) : (index += 1) {}
            if (index == slot_count) return error.WmfObjectTableFull;
            live.set(index);
            report.creates += 1;
            report.peak_live = @max(report.peak_live, live.count());
        } else if (isReference(record.function)) {
            if (record.size_words != 4) return error.InvalidWmfObjectRecordSize;
            const index = std.mem.readInt(u16, record.parameters[0..2], .little);
            if (index >= slot_count or !live.isSet(index)) return error.InvalidWmfObjectReference;
            report.selects += 1;
        } else if (record.function == 0x01f0) {
            if (record.size_words != 4) return error.InvalidWmfObjectRecordSize;
            const index = std.mem.readInt(u16, record.parameters[0..2], .little);
            if (index >= slot_count or !live.isSet(index)) return error.InvalidWmfObjectDelete;
            live.unset(index);
            report.deletes += 1;
        }
    }
    report.final_live = live.count();
    return report;
}
