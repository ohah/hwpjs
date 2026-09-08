const std = @import("std");
const t = std.testing;
const table = @import("tag_table.zig");
const model = @import("matrix_trc_model.zig");
const fixture = @import("tag_fixture.zig");
fn bytes() ![]u8 {
    const out = try fixture.make(t.allocator, 300, &.{
        .{ .signature = "rXYZ".*, .offset = 204, .size = 20 },
        .{ .signature = "gXYZ".*, .offset = 224, .size = 20 },
        .{ .signature = "bXYZ".*, .offset = 244, .size = 20 },
        .{ .signature = "rTRC".*, .offset = 264, .size = 12 },
        .{ .signature = "gTRC".*, .offset = 276, .size = 12 },
        .{ .signature = "bTRC".*, .offset = 288, .size = 12 },
    });
    @memcpy(out[12..16], "mntr");
    @memcpy(out[16..20], "RGB ");
    @memcpy(out[20..24], "XYZ ");
    for (0..3) |column| {
        const start = 204 + column * 20;
        @memcpy(out[start..][0..4], "XYZ ");
        for (0..3) |row| std.mem.writeInt(i32, out[start + 8 + row * 4 ..][0..4], @intCast(column * 3 + row + 1), .big);
        @memcpy(out[264 + column * 12 ..][0..4], "curv");
    }
    return out;
}
test "matrix TRC assembly transposes columns and ignores descriptor order" {
    const b = try bytes();
    defer t.allocator.free(b);
    for (0..6) |i| {
        const at = 132 + i * 12;
        const first = b[132..144].*;
        const second = b[at..][0..12].*;
        @memcpy(b[132..144], &second);
        @memcpy(b[at..][0..12], &first);
        var parsed = try table.parse(t.allocator, b, .{ .policy = .icc_2022 });
        defer parsed.deinit(t.allocator);
        const result = try model.assemble(&parsed, .v4_2022);
        try t.expectEqualDeep([9]i32{ 1, 4, 7, 2, 5, 8, 3, 6, 9 }, result.coefficients);
        for (result.curves) |curve| try t.expect(curve.curve_type == .identity);
        try t.expect(result.profile_semantics_deferred and result.transform_priority_deferred);
    }
}
test "matrix TRC assembly checks each missing tag and actual header constraints" {
    const b = try bytes();
    defer t.allocator.free(b);
    for (0..6) |i| {
        const at = 132 + i * 12;
        const name = b[at..][0..4].*;
        @memcpy(b[at..][0..4], "zzzz");
        var parsed = try table.parse(t.allocator, b, .{ .policy = .icc_2022 });
        defer parsed.deinit(t.allocator);
        try t.expectError(error.MissingIccMatrixModelTag, model.assemble(&parsed, .v4_2022));
        @memcpy(b[at..][0..4], &name);
    }
    var parsed = try table.parse(t.allocator, b, .{ .policy = .icc_2022 });
    defer parsed.deinit(t.allocator);
    try t.expectError(error.UnsupportedIccMatrixModelEdition, model.assemble(&parsed, .v2_2001));
    parsed.header.data_space = "3CLR".*;
    _ = try model.assemble(&parsed, .v4_2022);
    parsed.header.data_space = "CMYK".*;
    try t.expectError(error.InvalidIccRequiredModel, model.assemble(&parsed, .v4_2022));
    parsed.header.data_space = "RGB ".*;
    parsed.header.pcs = "Lab ".*;
    try t.expectError(error.InvalidIccRequiredModel, model.assemble(&parsed, .v4_2022));
    parsed.header.pcs = "XYZ ".*;
    parsed.header.profile_class = "prtr".*;
    try t.expectError(error.InvalidIccRequiredModel, model.assemble(&parsed, .v4_2022));
}
