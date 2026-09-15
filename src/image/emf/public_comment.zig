const std = @import("std");
const comment_record = @import("comment_record.zig");
const identifier = @import("public_comment_identifier.zig");
const group = @import("public_comment_group.zig");
const multiformats = @import("public_comment_multiformats.zig");
const windows_metafile = @import("public_comment_windows_metafile.zig");

pub const Unknown = struct { identifier: u32, data: []const u8 };

pub const PublicComment = union(enum) {
    begin_group: group.Begin,
    end_group,
    multi_formats: multiformats.MultiFormats,
    windows_metafile: windows_metafile.WindowsMetafile,
    unknown: Unknown,
};

pub fn parse(comment: comment_record.Comment) !?PublicComment {
    if (comment.classification != .public) return null;
    if (comment.parameters.len < 4) return error.TruncatedEmfPublicCommentIdentifier;
    const raw = std.mem.readInt(u32, comment.parameters[0..4], .little);
    const body = comment.parameters[4..];
    return switch (identifier.classify(raw)) {
        .windows_metafile => .{ .windows_metafile = try windows_metafile.parse(body) },
        .begin_group => .{ .begin_group = try group.parseBegin(body) },
        .end_group => blk: {
            try group.parseEnd(body);
            break :blk .end_group;
        },
        .multi_formats => .{ .multi_formats = try multiformats.parse(body) },
        .reserved => return error.ReservedEmfPublicCommentIdentifier,
        .unknown => |unknown| .{ .unknown = .{ .identifier = unknown, .data = body } },
    };
}

fn fixture(parameters: []const u8) comment_record.Comment {
    return .{
        .data_size = @intCast(4 + parameters.len),
        .data = &.{},
        .leading_dword = 0x43494447,
        .identifier = .public,
        .classification = .public,
        .parameters = parameters,
        .alignment_padding = &.{},
        .trailing_data = &.{},
    };
}

test "public dispatcher keeps unknown extension data and rejects reserved identifiers" {
    var bytes = [_]u8{ 0, 0, 0, 0, 1, 2, 3 };
    const unknown = (try parse(fixture(&bytes))).?.unknown;
    try std.testing.expectEqual(@as(u32, 0), unknown.identifier);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3 }, unknown.data);
    std.mem.writeInt(u32, bytes[0..4], 0x00000040, .little);
    try std.testing.expectError(error.ReservedEmfPublicCommentIdentifier, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[0..4], 0x00000080, .little);
    try std.testing.expectError(error.ReservedEmfPublicCommentIdentifier, parse(fixture(&bytes)));
    try std.testing.expectError(error.TruncatedEmfPublicCommentIdentifier, parse(fixture(bytes[0..3])));
}

test "public dispatcher does not claim other comment classifications" {
    var value = fixture(&.{});
    value.classification = .private;
    try std.testing.expect((try parse(value)) == null);
}

test "public dispatcher reaches every defined payload parser" {
    var begin = [_]u8{0} ** 24;
    std.mem.writeInt(u32, begin[0..4], 0x00000002, .little);
    try std.testing.expect((try parse(fixture(&begin))).? == .begin_group);

    var end = [_]u8{0} ** 4;
    std.mem.writeInt(u32, end[0..4], 0x00000003, .little);
    try std.testing.expect((try parse(fixture(&end))).? == .end_group);

    var formats = [_]u8{0} ** 24;
    std.mem.writeInt(u32, formats[0..4], 0x40000004, .little);
    try std.testing.expect((try parse(fixture(&formats))).? == .multi_formats);

    var wmf = [_]u8{0} ** 44;
    std.mem.writeInt(u32, wmf[0..4], 0x80000001, .little);
    std.mem.writeInt(u16, wmf[4..6], 0x0300, .little);
    std.mem.writeInt(u32, wmf[16..20], 24, .little);
    std.mem.writeInt(u16, wmf[20..22], 1, .little);
    std.mem.writeInt(u16, wmf[22..24], 9, .little);
    std.mem.writeInt(u16, wmf[24..26], 0x0300, .little);
    std.mem.writeInt(u32, wmf[26..30], 12, .little);
    std.mem.writeInt(u32, wmf[32..36], 3, .little);
    std.mem.writeInt(u32, wmf[38..42], 3, .little);
    try std.testing.expect((try parse(fixture(&wmf))).? == .windows_metafile);
}
