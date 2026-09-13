const BinData = @import("bin_data.zig").BinData;
const Version = @import("../version.zig").Version;
const framing = @import("../record.zig");

/// Resolves a one-based DocInfo BinData ordinal. The complete DocInfo stream is
/// consumed before success so malformed records after the selection cannot be
/// hidden by an early return.
pub fn byOrdinal(bytes: []const u8, version: Version, options: framing.Options, ordinal: usize) !BinData {
    if (ordinal == 0) return error.InvalidBinDataOrdinal;
    var it = try @import("reader.zig").Iterator.init(bytes, version, options);
    var seen: usize = 0;
    var selected: ?BinData = null;
    while (try it.next()) |record| {
        if (record.value != .bin_data) continue;
        seen += 1;
        if (seen == ordinal) selected = record.value.bin_data;
    }
    return selected orelse error.BinDataNotFound;
}
