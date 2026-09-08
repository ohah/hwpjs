const std = @import("std");
const t = std.testing;
const api = @import("required_table.zig");
test "required table derives class and spaces from actual header" {
    const bytes = try @import("tag_fixture.zig").make(t.allocator, 152, &.{.{ .signature = "desc".*, .offset = 144, .size = 8 }});
    defer t.allocator.free(bytes);
    bytes[12..16].* = "mntr".*;
    bytes[16..20].* = "RGB ".*;
    bytes[20..24].* = "XYZ ".*;
    var table = try @import("tag_table.zig").parse(t.allocator, bytes, .{ .policy = .bounded });
    defer table.deinit(t.allocator);
    const selection = api.Selection{ .edition = .v4_2022, .model = .matrix, .measurement_white = .unknown };
    const r = try api.inspect(&table, selection);
    try t.expectEqual(@as(usize, 9), r.required.count());
    try t.expectEqual(@as(usize, 8), r.missing.count());
    try t.expect(!r.missing.contains(.desc));
    try t.expect(r.payloads_deferred and r.computational_model_deferred and r.adaptation_condition_deferred);
    table.header.data_space = "GRAY".*;
    try t.expectError(error.InvalidIccRequiredModel, api.inspect(&table, selection));
    table.header.data_space = "RGB ".*;
    table.header.profile_class = "prtr".*;
    try t.expectError(error.InvalidIccRequiredModel, api.inspect(&table, selection));
    table.header.profile_class = "mntr".*;
    table.header.version.major = 2;
    try t.expectError(error.IccEditionMismatch, api.inspect(&table, selection));
    try t.expectError(error.UnsupportedIccRequiredEdition, api.inspect(&table, .{ .edition = .v2_2001, .model = .matrix, .measurement_white = .same }));
}
