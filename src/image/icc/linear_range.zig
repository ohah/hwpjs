const Linear = @import("parametric_segments.zig").Linear;
const clip = @import("linear_clip.zig");
const fractions = @import("fraction.zig");
pub const Interval = @import("unit_interval.zig").WideInterval;

fn value(line: Linear, x: fractions.Fraction) !fractions.WideFraction {
    const raw = try @import("affine_value.zig").at(line.slope, line.offset, x);
    // Called only for an affine piece of the shared clipping partition.
    if (raw.numerator < 0 or raw.numerator > @as(i128, @intCast(raw.denominator))) return error.InvalidIccLinearRangeInvariant;
    return .{ .numerator = @intCast(raw.numerator), .denominator = raw.denominator };
}
fn image(line: Linear, piece: clip.Piece) !Interval {
    if (piece.kind != .affine) {
        const y = fractions.WideFraction{ .numerator = if (piece.kind == .zero) 0 else 1, .denominator = 1 };
        // A nonempty constant piece attains its value even with open x endpoints.
        return .{ .start = y, .end = y };
    }
    var result = Interval{
        .start = try value(line, piece.interval.start),
        .end = try value(line, piece.interval.end),
        .start_included = piece.interval.start_included,
        .end_included = piece.interval.end_included,
    };
    switch (try result.start.order(result.end)) {
        .eq => {
            result.start_included = true;
            result.end_included = true;
        },
        .gt => {
            @import("std").mem.swap(fractions.WideFraction, &result.start, &result.end);
            @import("std").mem.swap(bool, &result.start_included, &result.end_included);
        },
        .lt => {},
    }
    try result.validate();
    return result;
}

/// Complete output range of one continuous clipped affine branch, not its x domain.
/// Reuses clipping pieces; does not duplicate level cuts or saturation conditions.
pub fn build(line: Linear) !Interval {
    const parts = try clip.partition(line);
    if (parts.count == 0) return error.InvalidIccLinearRangeInvariant;
    var result = try image(line, parts.pieces[0]);
    // A continuous image of a connected nonempty interval is connected. Thus
    // these factory-generated images have no gap for a hull to accidentally fill.
    for (parts.pieces[1..parts.count]) |part| {
        const next = try image(line, part);
        switch (try next.start.order(result.start)) {
            .lt => {
                result.start = next.start;
                result.start_included = next.start_included;
            },
            .eq => result.start_included = result.start_included or next.start_included,
            .gt => {},
        }
        switch (try next.end.order(result.end)) {
            .gt => {
                result.end = next.end;
                result.end_included = next.end_included;
            },
            .eq => result.end_included = result.end_included or next.end_included,
            .lt => {},
        }
    }
    try result.validate();
    return result;
}
