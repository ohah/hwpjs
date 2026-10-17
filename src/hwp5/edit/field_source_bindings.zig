//! Validate immutable mixed field topology before position-preserving formatting.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    return validateWith(a, source, version, false);
}

pub fn validateCharacterFormat(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    return validateWith(a, source, version, true);
}

fn validateWith(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, retain_object_numbers: bool) !void {
    var projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer projection.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, source, version, projection.sections[0]);
    defer a.free(bindings);
    var names = false;
    for (bindings) |binding| names = names or binding.span.field_id == @import("../body/control_rules.zig").id("%xrf");
    if (names) {
        const sites = try @import("cross_reference_bookmark_sites.zig").collect(a, source, version, 0);
        defer a.free(sites);
        for (bindings) |binding| {
            if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
            const view = try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command);
            if (retain_object_numbers and try @import("cross_reference_format_retention.zig").objectNumber(view)) continue;
            _ = try @import("../body/cross_reference_name_result.zig").evaluate(view, sites);
        }
    }
}

test "immutable field format topology validation releases every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, validate, .{ bytes, source.header.version() });
}
