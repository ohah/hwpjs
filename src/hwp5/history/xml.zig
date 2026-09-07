const std = @import("std");
const item = @import("item.zig");
const xml = @import("../xml_validation.zig");
/// Only after Item.parse has validated framing/presence. Writer/description are
/// WCHAR metadata, not XML. Reuse the record iterator instead of decoding offsets.
pub fn inspect(a: std.mem.Allocator, parsed: item.Item, framing: item.record.Options, budget: *xml.Budget) !void {
    var it = item.record.Iterator.init(parsed.raw, framing);
    while (try it.next()) |record| {
        switch (@as(item.value.Tag, @enumFromInt(record.tag))) {
            .diff_data => try budget.inspect(a, record.payload, .diff),
            .last_doc_data => try budget.inspect(a, record.payload, .last_document),
            else => {},
        }
    }
}
