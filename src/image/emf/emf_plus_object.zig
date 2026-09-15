const std = @import("std");
const record = @import("emf_plus_record.zig");

pub const ObjectType = enum(u7) {
    brush = 1,
    pen = 2,
    path = 3,
    region = 4,
    image = 5,
    font = 6,
    string_format = 7,
    image_attributes = 8,
    custom_line_cap = 9,
};

pub const Fragment = struct {
    object_id: u6,
    object_type: ObjectType,
    continues: bool,
    total_object_size: ?u32,
    object_data: []const u8,
};

pub fn parse(value: record.Record, multipart: bool) !Fragment {
    if (value.kind != .object) return error.NotEmfPlusObject;

    const raw_id: u8 = @truncate(value.flags);
    if (raw_id > 63) return error.InvalidEmfPlusObjectId;
    const raw_type: u7 = @truncate(value.flags >> 8);
    const object_type: ObjectType = switch (raw_type) {
        1...9 => @enumFromInt(raw_type),
        else => return error.InvalidEmfPlusObjectType,
    };
    const continues = value.flags & 0x8000 != 0;
    const has_total = continues or multipart;
    if (has_total and value.data.len < 4) return error.MissingEmfPlusTotalObjectSize;

    return .{
        .object_id = @intCast(raw_id),
        .object_type = object_type,
        .continues = continues,
        .total_object_size = if (has_total) std.mem.readInt(u32, value.data[0..4], .little) else null,
        .object_data = if (has_total) value.data[4..] else value.data,
    };
}

pub const Report = struct {
    records: usize = 0,
    completed: usize = 0,
    multipart_objects: usize = 0,
    multipart_fragments: usize = 0,
    object_data_bytes: usize = 0,
    replacements: usize = 0,
    live_objects: usize = 0,
};

const Pending = struct {
    object_id: u6,
    object_type: ObjectType,
    total_object_size: u32,
    received: u64,
};

pub const State = struct {
    table: [64]?ObjectType = .{null} ** 64,
    pending: ?Pending = null,
    report: Report = .{},

    pub fn consume(self: *State, value: record.Record) !bool {
        if (value.kind != .object) return false;
        var next = self.*;
        const fragment = try parse(value, next.pending != null);
        next.report.records = try add(next.report.records, 1);

        if (next.pending) |pending| {
            if (fragment.object_id != pending.object_id or fragment.object_type != pending.object_type)
                return error.MismatchedEmfPlusObjectContinuation;
            if (fragment.total_object_size.? != pending.total_object_size)
                return error.ChangedEmfPlusTotalObjectSize;
            const received = std.math.add(u64, pending.received, @as(u64, @intCast(fragment.object_data.len))) catch
                return error.EmfPlusObjectSizeExceeded;
            const aligned_total = std.mem.alignForward(u64, pending.total_object_size, 4);
            if (received > aligned_total) return error.EmfPlusObjectSizeExceeded;
            if (fragment.continues and received >= pending.total_object_size)
                return error.RedundantEmfPlusObjectContinuation;
            if (!fragment.continues and received < pending.total_object_size)
                return error.TruncatedEmfPlusObject;

            next.report.multipart_fragments = try add(next.report.multipart_fragments, 1);
            if (fragment.continues) {
                next.report.object_data_bytes = try add(next.report.object_data_bytes, fragment.object_data.len);
                next.pending.?.received = received;
            } else {
                next.report.object_data_bytes = try add(
                    next.report.object_data_bytes,
                    @intCast(@as(u64, pending.total_object_size) - pending.received),
                );
                next.pending = null;
                try next.complete(fragment.object_id, fragment.object_type);
            }
        } else if (fragment.continues) {
            const total = fragment.total_object_size.?;
            const received: u64 = @intCast(fragment.object_data.len);
            if (received >= total) return error.RedundantEmfPlusObjectContinuation;
            next.pending = .{
                .object_id = fragment.object_id,
                .object_type = fragment.object_type,
                .total_object_size = total,
                .received = received,
            };
            next.report.multipart_objects = try add(next.report.multipart_objects, 1);
            next.report.multipart_fragments = try add(next.report.multipart_fragments, 1);
            next.report.object_data_bytes = try add(next.report.object_data_bytes, fragment.object_data.len);
        } else {
            next.report.object_data_bytes = try add(next.report.object_data_bytes, fragment.object_data.len);
            try next.complete(fragment.object_id, fragment.object_type);
        }

        self.* = next;
        return true;
    }

    pub fn finish(self: State) !void {
        if (self.pending != null) return error.TruncatedEmfPlusObject;
    }

    fn complete(self: *State, object_id: u6, object_type: ObjectType) !void {
        const slot = @as(usize, object_id);
        if (self.table[slot] != null) {
            self.report.replacements = try add(self.report.replacements, 1);
        } else {
            self.report.live_objects = try add(self.report.live_objects, 1);
        }
        self.table[slot] = object_type;
        self.report.completed = try add(self.report.completed, 1);
    }
};

fn add(a: usize, b: usize) !usize {
    return std.math.add(usize, a, b) catch error.LimitExceeded;
}

fn makeRecord(flags: u16, data: []const u8) record.Record {
    return .{
        .offset = 0,
        .kind = .object,
        .flags = flags,
        .size = @intCast(12 + data.len),
        .data_size = @intCast(data.len),
        .data = data,
        .bytes = &.{},
    };
}

test "EMF+ object flags preserve type ID and noncontinued data" {
    const data = [_]u8{ 1, 2, 3, 4 };
    const value = try parse(makeRecord(0x0903, &data), false);
    try std.testing.expectEqual(ObjectType.custom_line_cap, value.object_type);
    try std.testing.expectEqual(@as(u6, 3), value.object_id);
    try std.testing.expect(!value.continues);
    try std.testing.expect(value.total_object_size == null);
    try std.testing.expectEqualSlices(u8, &data, value.object_data);

    try std.testing.expectError(error.InvalidEmfPlusObjectId, parse(makeRecord(0x0140, &data), false));
    try std.testing.expectError(error.InvalidEmfPlusObjectType, parse(makeRecord(0x0000, &data), false));
    try std.testing.expectError(error.InvalidEmfPlusObjectType, parse(makeRecord(0x0a00, &data), false));

    for (1..10) |raw_type| {
        const low = try parse(makeRecord(@intCast(raw_type << 8), &data), false);
        try std.testing.expectEqual(@as(u6, 0), low.object_id);
        try std.testing.expectEqual(@as(u7, @intCast(raw_type)), @intFromEnum(low.object_type));
        const high = try parse(makeRecord(@intCast((raw_type << 8) | 63), &data), false);
        try std.testing.expectEqual(@as(u6, 63), high.object_id);
    }
}

test "EMF+ object state validates multipart data and replaces slots" {
    const first = [_]u8{ 12, 0, 0, 0, 1, 2, 3, 4 };
    const middle = [_]u8{ 12, 0, 0, 0, 5, 6, 7, 8 };
    const last = [_]u8{ 12, 0, 0, 0, 9, 10, 11, 12 };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8302, &first)));
    try std.testing.expect(try state.consume(makeRecord(0x8302, &middle)));
    try std.testing.expect(try state.consume(makeRecord(0x0302, &last)));
    try state.finish();
    try std.testing.expectEqual(ObjectType.path, state.table[2].?);
    try std.testing.expectEqual(@as(usize, 3), state.report.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.completed);
    try std.testing.expectEqual(@as(usize, 1), state.report.multipart_objects);
    try std.testing.expectEqual(@as(usize, 3), state.report.multipart_fragments);
    try std.testing.expectEqual(@as(usize, 12), state.report.object_data_bytes);
    try std.testing.expectEqual(@as(usize, 0), state.report.replacements);
    try std.testing.expectEqual(@as(usize, 1), state.report.live_objects);

    const replacement = [_]u8{ 0, 0, 0, 0 };
    try std.testing.expect(try state.consume(makeRecord(0x0102, &replacement)));
    try std.testing.expectEqual(ObjectType.brush, state.table[2].?);
    try std.testing.expectEqual(@as(usize, 1), state.report.replacements);
    try std.testing.expectEqual(@as(usize, 1), state.report.live_objects);
}

test "EMF+ multipart failures are atomic" {
    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8501, &first)));
    const before = state;

    const changed = [_]u8{ 12, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expectError(error.ChangedEmfPlusTotalObjectSize, state.consume(makeRecord(0x0501, &changed)));
    try std.testing.expectEqualDeep(before, state);
    try std.testing.expectError(error.MismatchedEmfPlusObjectContinuation, state.consume(makeRecord(0x0502, &first)));
    try std.testing.expectEqualDeep(before, state);
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.finish());

    const short = [_]u8{ 8, 0, 0, 0 };
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.consume(makeRecord(0x0501, &short)));
    try std.testing.expectEqualDeep(before, state);
    const too_long = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12 };
    try std.testing.expectError(error.EmfPlusObjectSizeExceeded, state.consume(makeRecord(0x0501, &too_long)));
    try std.testing.expectEqualDeep(before, state);
}

test "EMF+ multipart continuation marker must agree with total size" {
    const complete_but_continued = [_]u8{ 4, 0, 0, 0, 1, 2, 3, 4 };
    var state: State = .{};
    try std.testing.expectError(error.RedundantEmfPlusObjectContinuation, state.consume(makeRecord(0x8100, &complete_but_continued)));
    try std.testing.expectEqualDeep(State{}, state);

    const missing_total = [_]u8{ 1, 2, 3 };
    try std.testing.expectError(error.MissingEmfPlusTotalObjectSize, state.consume(makeRecord(0x8100, &missing_total)));
    try std.testing.expectEqualDeep(State{}, state);

    const first = [_]u8{ 8, 0, 0, 0, 1, 2, 3, 4 };
    const exact_but_continued = [_]u8{ 8, 0, 0, 0, 5, 6, 7, 8 };
    try std.testing.expect(try state.consume(makeRecord(0x8100, &first)));
    const before = state;
    try std.testing.expectError(
        error.RedundantEmfPlusObjectContinuation,
        state.consume(makeRecord(0x8100, &exact_but_continued)),
    );
    try std.testing.expectEqualDeep(before, state);
}

test "EMF+ multipart final fragment separates alignment padding from object bytes" {
    const first = [_]u8{ 7, 0, 0, 0, 1, 2, 3, 4 };
    const final = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 0xaa };
    var state: State = .{};
    try std.testing.expect(try state.consume(makeRecord(0x8201, &first)));
    try std.testing.expect(try state.consume(makeRecord(0x0201, &final)));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 7), state.report.object_data_bytes);

    var excessive: State = .{};
    try std.testing.expect(try excessive.consume(makeRecord(0x8201, &first)));
    const too_much = [_]u8{ 7, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12 };
    try std.testing.expectError(error.EmfPlusObjectSizeExceeded, excessive.consume(makeRecord(0x0201, &too_much)));
}

test "EMF+ multipart arithmetic accepts the u32 maximum plus final padding" {
    var state: State = .{};
    state.pending = .{
        .object_id = 0,
        .object_type = .brush,
        .total_object_size = std.math.maxInt(u32),
        .received = std.math.maxInt(u32) - 3,
    };
    state.report.object_data_bytes = std.math.maxInt(u32) - 3;
    const final = [_]u8{ 0xff, 0xff, 0xff, 0xff, 1, 2, 3, 0xaa };
    try std.testing.expect(try state.consume(makeRecord(0x0100, &final)));
    try state.finish();
    try std.testing.expectEqual(@as(usize, std.math.maxInt(u32)), state.report.object_data_bytes);
}

test "EMF+ object report overflow leaves table and counters unchanged" {
    const data = [_]u8{ 1, 2, 3, 4 };
    var state: State = .{};
    state.report.completed = std.math.maxInt(usize);
    const before = state;
    try std.testing.expectError(error.LimitExceeded, state.consume(makeRecord(0x0100, &data)));
    try std.testing.expectEqualDeep(before, state);
}
