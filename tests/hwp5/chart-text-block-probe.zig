const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const max_string = try input.readInt(u32);
    const max_total = try input.readInt(u32);
    const contents = bytes[input.offset..];
    var prefix = try @import("chart-footnote-prefix.zig").read(a, contents, limit);
    defer prefix.deinit();
    var reader = prefix.reader;
    // Explicit corpus Footnote/ChartText entry, not general chart routing.
    const footnote_id = try reader.readInt(u32);
    if (footnote_id == 0xffffffff) return error.UnsupportedChartObjectReference;
    inline for (.{ "VtChartFootnote\x00", "VtChartText\x00" }) |name| {
        const ref = try prefix.grid.prelude.types.readObserved16(&reader);
        if (!std.mem.eql(u8, ref.declaration.raw_name, name)) return error.UnsupportedChartClass;
        if (ref.declaration.version != 1) return error.UnsupportedChartTypeVersion;
    }
    const block = try core.hwp5.chart_text_block.readObservedV2(&reader, &prefix.grid.prelude.types, .{ .max_string_bytes = max_string, .max_total_string_bytes = max_total });
    return serialize(a, block);
}
pub fn serialize(a: std.mem.Allocator, block: core.hwp5.chart_text_block.Block) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (.{ block.end, block.object_id, block.font.object_id, block.font.name.object_id, block.text.object_id, block.font.name.bytes.len, block.font.name.trailer, block.text.bytes.len, block.text.trailer }) |field|
        try int(a, &out, u32, @intCast(field));
    try out.appendSlice(a, &block.prefix);
    try out.appendSlice(a, &block.font.raw);
    try out.appendSlice(a, &block.middle);
    try out.appendSlice(a, &block.suffix);
    try out.appendSlice(a, block.font.name.bytes);
    try out.appendSlice(a, block.text.bytes);
    return out.toOwnedSlice(a);
}
