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
    try @import("../feature_policy.zig").requireSupported(&header, options.distribution);
    var local = options;
    local.framing.max_records = @min(options.framing.max_records, options.max_total_records);
    const doc = try @import("docinfo.zig").inspect(a, input.doc_info, header.version(), local);
    if (doc.properties.section_count != input.sections.len) return error.SectionCountMismatch;
    const set = try @import("section_set.zig").inspect(a, input.sections, header.version(), doc.resources, options, options.max_total_records - doc.records);
    // Transfer the section array into the document report; all other fields are scalar.
    return .{ .header = header, .doc_info = doc, .sections = set.sections, .total_bytes = options.max_total_bytes - remaining, .total_records = doc.records + set.records, .memo_references = set.memo_references, .memo_end_references = set.memo_end_references, .memo_ranges = set.memo_ranges };
}
fn charge(remaining: *usize, count: usize) !void {
    if (count > remaining.*) return error.LimitExceeded;
    remaining.* -= count;
}
