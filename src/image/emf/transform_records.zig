const std = @import("std");
const records = @import("records.zig");
const xform = @import("xform.zig");

pub const ModifyMode = enum(u32) {
    identity = 1,
    left_multiply = 2,
    right_multiply = 3,
    set = 4,
};

pub const Modify = struct { transform: xform.XForm, mode: ModifyMode };
pub const Transform = union(enum) {
    set_world: xform.XForm,
    modify_world: Modify,
};

pub fn parse(record: records.Record) !?Transform {
    return switch (record.kind) {
        .setworldtransform => blk: {
            if (record.size != 32 or record.bytes.len != 32) return error.InvalidEmfSetWorldTransformSize;
            break :blk .{ .set_world = try xform.parse(record.bytes[8..32]) };
        },
        .modifyworldtransform => blk: {
            if (record.size != 36 or record.bytes.len != 36) return error.InvalidEmfModifyWorldTransformSize;
            const raw_mode = std.mem.readInt(u32, record.bytes[32..36], .little);
            const mode = std.enums.fromInt(ModifyMode, raw_mode) orelse return error.InvalidEmfModifyWorldTransformMode;
            break :blk .{ .modify_world = .{
                .transform = try xform.parse(record.bytes[8..32]),
                .mode = mode,
            } };
        },
        else => null,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "world transform records parse exact payloads and all modify modes" {
    var set_bytes = [_]u8{0} ** 32;
    std.mem.writeInt(u32, set_bytes[8..12], 0x3f800000, .little);
    const set = (try parse(fixture(.setworldtransform, &set_bytes))).?.set_world;
    try std.testing.expectEqual(@as(u32, 0x3f800000), set.m11.bits);

    var modify_bytes = [_]u8{0} ** 36;
    for ([_]ModifyMode{ .identity, .left_multiply, .right_multiply, .set }) |mode| {
        std.mem.writeInt(u32, modify_bytes[32..36], @intFromEnum(mode), .little);
        const modify = (try parse(fixture(.modifyworldtransform, &modify_bytes))).?.modify_world;
        try std.testing.expectEqual(mode, modify.mode);
    }
}

test "world transform records reject size mode and type drift" {
    var bytes = [_]u8{0} ** 36;
    try std.testing.expectError(error.InvalidEmfSetWorldTransformSize, parse(fixture(.setworldtransform, &bytes)));
    try std.testing.expectError(error.InvalidEmfModifyWorldTransformMode, parse(fixture(.modifyworldtransform, &bytes)));
    bytes[32] = 5;
    try std.testing.expectError(error.InvalidEmfModifyWorldTransformMode, parse(fixture(.modifyworldtransform, &bytes)));
    var oversized = [_]u8{0} ** 40;
    oversized[32] = 1;
    try std.testing.expectError(error.InvalidEmfModifyWorldTransformSize, parse(fixture(.modifyworldtransform, &oversized)));
    try std.testing.expect((try parse(fixture(.savedc, bytes[0..8]))) == null);
}
