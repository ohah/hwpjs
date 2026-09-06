const std = @import("std");
pub const types = @import("types.zig");
pub const Input = types.Input;
pub const Options = types.Options;
pub const Report = types.Report;
/// Caller decodes DocInfo/sections using hwp5.stream first. Never decompress twice.
/// Only the provided streams are covered; CFB/BinData/other storage checks are external.
pub fn inspectDecoded(a: std.mem.Allocator, input: Input, options: Options) !Report {
    try options.validate();
    if (input.sections.len > options.max_sections) return error.LimitExceeded;
    var remaining = options.max_total_bytes;
    try charge(&remaining, input.header.len);
    try charge(&remaining, input.doc_info.len);
    for (input.sections) |s| try charge(&remaining, s.bytes.len);
    const header = try types.Header.parse(input.header);
    try @import("../stream.zig").requireSupported(&header);
    var local = options;
    local.framing.max_records = @min(options.framing.max_records, options.max_total_records);
    const doc = try @import("docinfo.zig").inspect(a, input.doc_info, header.version(), local);
    if (doc.properties.section_count != input.sections.len) return error.SectionCountMismatch;
    // Allocate from checked supplied sections, never only from a declared count.
    const order = try a.alloc(usize, input.sections.len);
    defer a.free(order);
    @memset(order, std.math.maxInt(usize));
    for (input.sections, 0..) |s, i| {
        if (s.index >= order.len) return error.InvalidSectionIndex;
        if (order[s.index] != std.math.maxInt(usize)) return error.DuplicateSectionIndex;
        order[s.index] = i;
    }
    const sections = try a.alloc(types.SectionReport, input.sections.len);
    errdefer a.free(sections);
    var records = doc.records;
    var memos: @import("../memo_references.zig").Index = .{};
    defer memos.deinit(a);
    for (order, 0..) |input_index, index| {
        local.framing.max_records = @min(options.framing.max_records, options.max_total_records - records);
        sections[index] = try @import("section.zig").inspectCollected(a, input.sections[input_index].bytes, header.version(), doc.resources, local, .{ .index = &memos, .allocator = a, .section = index });
        records += sections[index].records;
    }
    const memo_report = memos.inspect();
    try memo_report.validateKnown();
    const memo_end_report = memos.inspectEnds();
    try memo_end_report.validateKnown();
    return .{ .header = header, .doc_info = doc, .sections = sections, .total_bytes = options.max_total_bytes - remaining, .total_records = records, .memo_references = memo_report, .memo_end_references = memo_end_report };
}
fn charge(remaining: *usize, count: usize) !void {
    if (count > remaining.*) return error.LimitExceeded;
    remaining.* -= count;
}
