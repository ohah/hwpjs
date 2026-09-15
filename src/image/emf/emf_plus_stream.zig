const std = @import("std");
const comment_record = @import("comment_record.zig");
const record = @import("emf_plus_record.zig");
const header_record = @import("emf_plus_header.zig");

pub const Report = struct {
    comments: usize = 0,
    records: usize = 0,
    header: ?header_record.Header = null,
    end_of_file_records: usize = 0,
    get_dc_records: usize = 0,
};

pub const State = struct {
    report: Report = .{},
    ended: bool = false,

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
                else => {},
            }
        }
        if (records_in_comment == 0) return error.EmptyEmfPlusComment;
        pending.report.comments = std.math.add(usize, pending.report.comments, 1) catch return error.LimitExceeded;
        self.* = pending;
        return true;
    }

    pub fn finish(self: State) !void {
        if (self.report.header != null and !self.ended) return error.MissingEmfPlusEndOfFile;
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
