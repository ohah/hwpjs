const File = @import("../../cfb/reader.zig").File;
const text = @import("../preview/text.zig");
/// Optional root stream, uncompressed even when DocInfo/BodyText are compressed.
pub fn inspect(file: *const File, used: []bool, remaining: *usize) !?text.Stats {
    const index = try file.findExact("/PrvText") orelse return null;
    const entry = file.entries[index];
    if (entry.kind != 2) return error.InvalidHwpEntryKind;
    if (entry.content.len > remaining.*) return error.LimitExceeded;
    const parsed = try text.Text.parse(entry.content);
    remaining.* -= parsed.raw.len;
    used[index] = true;
    return parsed.stats;
}
