//! Shared source binding for current formula text, no owned strings or model.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
const Replacement = @import("character_style_formula_ranges.zig").Replacement;

pub fn appendChanged(a: std.mem.Allocator, output: *std.ArrayList(Replacement), input: *const Sites, local: *const Sites, results: []const @import("formula_result_sites.zig").Replacement) !void {
    for (results) |replacement| {
        if (replacement.site_index >= input.items.len) return error.InvalidTextSites;
        const source = input.items[replacement.site_index];
        if (std.mem.eql(u8, source.text, replacement.text)) continue;
        var found: ?usize = null;
        for (local.items, 0..) |site, index| if (site.element_index == source.element_index and site.start == source.start) {
            if (found != null) return error.AmbiguousFormulaResultSite;
            if (site.end != source.end) return error.SourceBindingMismatch;
            found = index;
        };
        if (found) |index| {
            for (output.items) |previous| if (previous.site_index == index) return error.AmbiguousFormulaResultSite;
            try output.append(a, .{ .site_index = index, .text = replacement.text });
        }
    }
}

test "HWPX formula style bindings distinguish other paragraphs and reject ambiguous owners" {
    const a = std.testing.allocator;
    var rows = [_]@import("text_sites.zig").Site{.{ .element_index = 1, .start = 2, .end = 3, .text = @constCast("9") }};
    const sites: Sites = .{ .items = &rows };
    var output: std.ArrayList(Replacement) = .empty;
    defer output.deinit(a);
    const changed = [_]@import("formula_result_sites.zig").Replacement{.{ .site_index = 0, .text = @constCast("42") }};
    try appendChanged(a, &output, &sites, &.{ .items = &.{} }, &changed);
    try std.testing.expectEqual(@as(usize, 0), output.items.len);
    try appendChanged(a, &output, &sites, &sites, &changed);
    try std.testing.expectEqualStrings("42", output.items[0].text);
    try std.testing.expectError(error.AmbiguousFormulaResultSite, appendChanged(a, &output, &sites, &sites, &changed));
    var duplicates = [_]@import("text_sites.zig").Site{ rows[0], rows[0] };
    try std.testing.expectError(error.AmbiguousFormulaResultSite, appendChanged(a, &output, &sites, &.{ .items = &duplicates }, &changed));
    const invalid = [_]@import("formula_result_sites.zig").Replacement{.{ .site_index = 1, .text = @constCast("42") }};
    try std.testing.expectError(error.InvalidTextSites, appendChanged(a, &output, &sites, &sites, &invalid));
}
