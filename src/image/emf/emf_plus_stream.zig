const std = @import("std");
const comment_record = @import("comment_record.zig");
const record = @import("emf_plus_record.zig");
const header_record = @import("emf_plus_header.zig");
const private_comment = @import("emf_plus_comment.zig");
const object_record = @import("emf_plus_object.zig");
const serializable_object = @import("emf_plus_serializable_object.zig");
const image_effect_guid = @import("emf_plus_image_effect_guid.zig");
const clear_record = @import("emf_plus_clear.zig");

pub const Report = struct {
    comments: usize = 0,
    records: usize = 0,
    header: ?header_record.Header = null,
    end_of_file_records: usize = 0,
    get_dc_records: usize = 0,
    private_comments: usize = 0,
    private_data_bytes: usize = 0,
    objects: object_record.Report = .{},
    serializable_objects: usize = 0,
    image_effects: [image_effect_guid.effect_count]usize = .{0} ** image_effect_guid.effect_count,
    clear_records: usize = 0,
};

pub const State = struct {
    report: Report = .{},
    ended: bool = false,
    object_state: object_record.State = .{},

    pub fn consume(self: *State, comment: comment_record.Comment, emf_record_index: usize) !bool {
        if (comment.classification != .emf_plus) return false;
        if (self.ended) return error.EmfPlusRecordAfterEndOfFile;

        var iterator: record.Iterator = .{ .bytes = comment.parameters };
        var records_in_comment: usize = 0;
        var pending = self.*;
        while (try iterator.next()) |value| {
            records_in_comment += 1;
            pending.report.records = std.math.add(usize, pending.report.records, 1) catch return error.LimitExceeded;
            if (pending.report.header == null) {
                if (emf_record_index != 2 or value.kind != .header) return error.MissingInitialEmfPlusHeader;
                pending.report.header = try header_record.parse(value);
            } else if (value.kind == .header) return error.DuplicateEmfPlusHeader;

            switch (value.kind) {
                .end_of_file => {
                    if (value.size != 12 or value.data_size != 0) return error.InvalidEmfPlusEndOfFileSize;
                    pending.report.end_of_file_records += 1;
                    pending.ended = true;
                    if (iterator.offset != comment.parameters.len) return error.EmfPlusRecordAfterEndOfFile;
                },
                .get_dc => {
                    if (value.size != 12 or value.data_size != 0) return error.InvalidEmfPlusGetDcSize;
                    pending.report.get_dc_records += 1;
                },
                .multi_format_start, .multi_format_section, .multi_format_end => return error.ReservedEmfPlusRecordType,
                else => {},
            }
            _ = try pending.object_state.consume(value);
            if (value.kind == .serializable_object) {
                const parsed = try serializable_object.parse(value);
                pending.report.serializable_objects = std.math.add(usize, pending.report.serializable_objects, 1) catch return error.LimitExceeded;
                const effect_index: usize = @intFromEnum(parsed.kind);
                pending.report.image_effects[effect_index] = std.math.add(usize, pending.report.image_effects[effect_index], 1) catch return error.LimitExceeded;
            }
            if (value.kind == .clear) {
                _ = try clear_record.parse(value);
                pending.report.clear_records = std.math.add(usize, pending.report.clear_records, 1) catch return error.LimitExceeded;
            }
            if (private_comment.parse(value)) |parsed| {
                pending.report.private_comments = std.math.add(usize, pending.report.private_comments, 1) catch return error.LimitExceeded;
                pending.report.private_data_bytes = std.math.add(usize, pending.report.private_data_bytes, parsed.private_data.len) catch return error.LimitExceeded;
            }
        }
        if (records_in_comment == 0) return error.EmptyEmfPlusComment;
        pending.report.comments = std.math.add(usize, pending.report.comments, 1) catch return error.LimitExceeded;
        pending.report.objects = pending.object_state.report;
        self.* = pending;
        return true;
    }

    pub fn finish(self: State) !void {
        if (self.report.header != null and !self.ended) return error.MissingEmfPlusEndOfFile;
        try self.object_state.finish();
    }
};

fn testComment(parameters: []const u8) comment_record.Comment {
    return .{
        .data_size = @intCast(parameters.len + 4),
        .data = parameters,
        .leading_dword = 0x2b464d45,
        .identifier = .emf_plus,
        .classification = .emf_plus,
        .parameters = parameters,
        .alignment_padding = &.{},
        .trailing_data = &.{},
    };
}

fn writeHeader(bytes: []u8) void {
    std.mem.writeInt(u16, bytes[0..2], 0x4001, .little);
    std.mem.writeInt(u32, bytes[4..8], 28, .little);
    std.mem.writeInt(u32, bytes[8..12], 16, .little);
    std.mem.writeInt(u32, bytes[12..16], 0xdbc01001, .little);
    std.mem.writeInt(u32, bytes[20..24], 96, .little);
    std.mem.writeInt(u32, bytes[24..28], 96, .little);
}

fn writeEmptyRecord(bytes: []u8, kind: u16) void {
    std.mem.writeInt(u16, bytes[0..2], kind, .little);
    std.mem.writeInt(u32, bytes[4..8], 12, .little);
}

test "EMF+ stream spans comments while every record remains locally complete" {
    var first = [_]u8{0} ** 40;
    writeHeader(first[0..28]);
    writeEmptyRecord(first[28..40], 0x4004);
    var last = [_]u8{0} ** 12;
    writeEmptyRecord(&last, 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&first), 2));
    try std.testing.expect(!try state.consume(.{
        .data_size = 0,
        .data = &.{},
        .leading_dword = null,
        .identifier = null,
        .classification = .private,
        .parameters = &.{},
        .alignment_padding = &.{},
        .trailing_data = &.{},
    }, 3));
    try std.testing.expect(try state.consume(testComment(&last), 4));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 2), state.report.comments);
    try std.testing.expectEqual(@as(usize, 3), state.report.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.get_dc_records);
    try std.testing.expectEqual(@as(usize, 1), state.report.end_of_file_records);
}

test "EMF+ stream enforces initial and terminal records atomically" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);
    var comment = [_]u8{0} ** 12;
    writeEmptyRecord(&comment, 0x4003);

    var state: State = .{};
    try std.testing.expectError(error.EmptyEmfPlusComment, state.consume(testComment(&.{}), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);
    try std.testing.expectError(error.MissingInitialEmfPlusHeader, state.consume(testComment(&header), 3));
    try std.testing.expectEqual(@as(?header_record.Header, null), state.report.header);
    try std.testing.expectError(error.MissingInitialEmfPlusHeader, state.consume(testComment(&comment), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);

    try std.testing.expect(try state.consume(testComment(&header), 2));
    try std.testing.expectError(error.DuplicateEmfPlusHeader, state.consume(testComment(&header), 3));
    try std.testing.expectEqual(@as(usize, 1), state.report.records);
    try std.testing.expectError(error.MissingEmfPlusEndOfFile, state.finish());
    try std.testing.expect(try state.consume(testComment(&eof), 3));
    try std.testing.expectError(error.EmfPlusRecordAfterEndOfFile, state.consume(testComment(&comment), 4));
    try std.testing.expectEqual(@as(usize, 2), state.report.records);
}

test "EMF+ EOF must be the final record in its comment" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4002);
    writeEmptyRecord(bytes[40..52], 0x4003);
    var state: State = .{};
    try std.testing.expectError(error.EmfPlusRecordAfterEndOfFile, state.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);
}

test "EMF+ fixed control records ignore flags but require exact empty payloads" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&header), 2));

    var get_dc = [_]u8{0} ** 12;
    writeEmptyRecord(&get_dc, 0x4004);
    std.mem.writeInt(u16, get_dc[2..4], 0xffff, .little);
    try std.testing.expect(try state.consume(testComment(&get_dc), 3));

    var bad_get_dc = [_]u8{0} ** 16;
    writeEmptyRecord(bad_get_dc[0..12], 0x4004);
    std.mem.writeInt(u32, bad_get_dc[4..8], 16, .little);
    std.mem.writeInt(u32, bad_get_dc[8..12], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusGetDcSize, state.consume(testComment(&bad_get_dc), 4));
    try std.testing.expectEqual(@as(usize, 2), state.report.records);

    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);
    std.mem.writeInt(u16, eof[2..4], 0xffff, .little);
    try std.testing.expect(try state.consume(testComment(&eof), 4));

    var second: State = .{};
    try std.testing.expect(try second.consume(testComment(&header), 2));
    var bad_eof = [_]u8{0} ** 16;
    writeEmptyRecord(bad_eof[0..12], 0x4002);
    std.mem.writeInt(u32, bad_eof[4..8], 16, .little);
    std.mem.writeInt(u32, bad_eof[8..12], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusEndOfFileSize, second.consume(testComment(&bad_eof), 3));
    try std.testing.expectEqual(@as(usize, 1), second.report.records);
}

test "EMF+ stream counts private comments without interpreting their data" {
    var bytes = [_]u8{0} ** 48;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4003, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    bytes[40..48].* = .{ 0, 1, 2, 3, 0xfc, 0xfd, 0xfe, 0xff };
    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try std.testing.expect(try state.consume(testComment(&eof), 3));
    try std.testing.expectEqual(@as(usize, 1), state.report.private_comments);
    try std.testing.expectEqual(@as(usize, 8), state.report.private_data_bytes);
}

test "EMF+ stream rejects all reserved multi-format record types atomically" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    for ([_]u16{ 0x4005, 0x4006, 0x4007 }) |kind| {
        var reserved = [_]u8{0} ** 12;
        writeEmptyRecord(&reserved, kind);
        var state: State = .{};
        try std.testing.expect(try state.consume(testComment(&header), 2));
        try std.testing.expectError(error.ReservedEmfPlusRecordType, state.consume(testComment(&reserved), 3));
        try std.testing.expectEqual(@as(usize, 1), state.report.records);
        try std.testing.expectEqual(@as(usize, 1), state.report.comments);
        try std.testing.expectError(error.MissingEmfPlusEndOfFile, state.finish());
    }
}

test "EMF+ private comment aggregate overflow leaves the entire state unchanged" {
    var bytes = [_]u8{0} ** 44;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4003, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 1, 2, 3, 4 };

    var count_overflow: State = .{};
    count_overflow.report.private_comments = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, count_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(?header_record.Header, null), count_overflow.report.header);
    try std.testing.expectEqual(@as(usize, 0), count_overflow.report.records);
    try std.testing.expectEqual(std.math.maxInt(usize), count_overflow.report.private_comments);

    var bytes_overflow: State = .{};
    bytes_overflow.report.private_data_bytes = std.math.maxInt(usize) - 3;
    try std.testing.expectError(error.LimitExceeded, bytes_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(?header_record.Header, null), bytes_overflow.report.header);
    try std.testing.expectEqual(@as(usize, 0), bytes_overflow.report.records);
    try std.testing.expectEqual(std.math.maxInt(usize) - 3, bytes_overflow.report.private_data_bytes);
}

test "EMF+ multipart object crosses comments and ignores intervening non-object records" {
    var first = [_]u8{0} ** 48;
    writeHeader(first[0..28]);
    std.mem.writeInt(u16, first[28..30], 0x4008, .little);
    std.mem.writeInt(u16, first[30..32], 0x8507, .little);
    std.mem.writeInt(u32, first[32..36], 20, .little);
    std.mem.writeInt(u32, first[36..40], 8, .little);
    std.mem.writeInt(u32, first[40..44], 8, .little);
    first[44..48].* = .{ 1, 2, 3, 4 };

    var second = [_]u8{0} ** 44;
    writeEmptyRecord(second[0..12], 0x4004);
    std.mem.writeInt(u16, second[12..14], 0x4008, .little);
    std.mem.writeInt(u16, second[14..16], 0x0507, .little);
    std.mem.writeInt(u32, second[16..20], 20, .little);
    std.mem.writeInt(u32, second[20..24], 8, .little);
    std.mem.writeInt(u32, second[24..28], 8, .little);
    second[28..32].* = .{ 5, 6, 7, 8 };
    writeEmptyRecord(second[32..44], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&first), 2));
    try std.testing.expect(try state.consume(testComment(&second), 3));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 2), state.report.objects.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.objects.completed);
    try std.testing.expectEqual(@as(usize, 2), state.report.objects.multipart_fragments);
    try std.testing.expectEqual(@as(usize, 8), state.report.objects.object_data_bytes);
    try std.testing.expectEqual(object_record.ObjectType.image, state.object_state.table[7].?);
}

test "EMF+ EOF cannot complete a pending multipart object" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4008, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x8100, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(u32, bytes[40..44], 8, .little);
    bytes[44..48].* = .{ 1, 2, 3, 4 };
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.finish());
    try std.testing.expectEqual(@as(usize, 0), state.report.objects.completed);
    try std.testing.expectEqual(@as(usize, 0), state.report.objects.live_objects);
}

test "EMF+ stream validates and counts serializable image effects" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4038, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 40, .little);
    std.mem.writeInt(u32, bytes[36..40], 28, .little);
    bytes[40..56].* = image_effect_guid.tint;
    std.mem.writeInt(u32, bytes[56..60], 8, .little);
    std.mem.writeInt(u32, bytes[60..64], @bitCast(@as(i32, -180)), .little);
    std.mem.writeInt(u32, bytes[64..68], 100, .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.serializable_objects);
    try std.testing.expectEqual(@as(usize, 1), state.report.image_effects[@intFromEnum(image_effect_guid.Kind.tint)]);
    for (state.report.image_effects, 0..) |count, i|
        if (i != @intFromEnum(image_effect_guid.Kind.tint)) try std.testing.expectEqual(@as(usize, 0), count);
}

test "EMF+ serializable aggregate overflow leaves the whole comment unchanged" {
    var bytes = [_]u8{0} ** 68;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4038, .little);
    std.mem.writeInt(u32, bytes[32..36], 40, .little);
    std.mem.writeInt(u32, bytes[36..40], 28, .little);
    bytes[40..56].* = image_effect_guid.tint;
    std.mem.writeInt(u32, bytes[56..60], 8, .little);

    var count_overflow: State = .{};
    count_overflow.report.serializable_objects = std.math.maxInt(usize);
    const before_count = count_overflow;
    try std.testing.expectError(error.LimitExceeded, count_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqualDeep(before_count, count_overflow);

    var effect_overflow: State = .{};
    effect_overflow.report.image_effects[@intFromEnum(image_effect_guid.Kind.tint)] = std.math.maxInt(usize);
    const before_effect = effect_overflow;
    try std.testing.expectError(error.LimitExceeded, effect_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqualDeep(before_effect, effect_overflow);
}

test "EMF+ stream validates and counts Clear records atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4009, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 0x11, 0x22, 0x33, 0x44 };
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.clear_records);

    var malformed = bytes;
    std.mem.writeInt(u16, malformed[28..30], 0x4009, .little);
    std.mem.writeInt(u32, malformed[32..36], 12, .little);
    std.mem.writeInt(u32, malformed[36..40], 0, .little);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusClearSize, malformed_state.consume(testComment(malformed[0..40]), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.clear_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}
