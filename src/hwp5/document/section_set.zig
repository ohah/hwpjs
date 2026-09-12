const std = @import("std");
const types = @import("types.zig");
pub const Report = struct {
    sections: []types.SectionReport,
    records: usize,
    memo_references: @import("../memo_references.zig").Report,
    memo_end_references: @import("../memo_references.zig").EndReport,
    memo_ranges: @import("../body/memo_ranges.zig").Report,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.sections);
        self.* = undefined;
    }
};
/// Owns section reports; resource counts are already validated by the caller.
/// Memo references and form budgets span this set, never a different document view.
pub fn inspect(a: std.mem.Allocator, input: []const types.Section, version: @import("../version.zig").Version, counts: @import("../docinfo/resources.zig").Report, options: types.Options, remaining_records: usize) !Report {
    if (input.len > options.max_sections) return error.LimitExceeded;
    const order = try @import("section_order.zig").build(a, input);
    defer a.free(order);
    const sections = try a.alloc(types.SectionReport, input.len);
    errdefer a.free(sections);
    var records: usize = 0;
    var local = options;
    var memos: @import("../memo_references.zig").Index = .{};
    defer memos.deinit(a);
    var ranges: @import("../body/memo_range_collection.zig").Collection = .{};
    defer ranges.deinit(a);
    for (order, 0..) |input_index, index| {
        local.framing.max_records = @min(options.framing.max_records, remaining_records - records);
        sections[index] = try @import("section.zig").inspectCollected(a, input[input_index].bytes, version, counts, local, .{ .index = &memos, .allocator = a, .section = index, .ranges = &ranges });
        records += sections[index].records;
        try @import("form_budget.zig").consume(&local.forms, sections[index].forms);
    }
    const memo_report = memos.inspect();
    try memo_report.validateKnown();
    const memo_end_report = memos.inspectEnds();
    try memo_end_report.validateKnown();
    const range_report = try @import("../body/memo_ranges.zig").inspect(a, ranges.events.items);
    return .{ .sections = sections, .records = records, .memo_references = memo_report, .memo_end_references = memo_end_report, .memo_ranges = range_report };
}
