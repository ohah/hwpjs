/// A source-coordinate bracket with an exact fractional upper weight.
/// Instances returned by Axis.at always index visible source samples.
pub const Weights = struct {
    lower: u16,
    upper: u16,
    upper_weight: u32,
    denominator: u32,

    /// Half ties choose the higher source index, after border replication.
    pub fn nearest(self: Weights) u16 {
        return if (@as(u64, self.upper_weight) * 2 >= self.denominator) self.upper else self.lower;
    }
};

/// Centered sample placement from T.871 clause 9's actual dimension ratio.
/// Not a hidden substitution of JPEG Hi/Hmax or Vi/Vmax for odd dimensions.
pub const Axis = struct {
    reference: u16,
    source: u16,

    pub fn fromDimensions(reference: u16, source: u16) !Axis {
        if (reference == 0 or source == 0 or source > reference) return error.InvalidJpegSampleAxis;
        return .{ .reference = reference, .source = source };
    }

    /// The inverse of source_center(i) = (i + 1/2) * ref/src - 1/2.
    /// Out-of-reference coordinates return null; outside source centers use
    /// replicated borders, an explicit reconstruction policy (not mandated).
    pub fn at(self: Axis, coordinate: u32) ?Weights {
        if (coordinate >= self.reference) return null;
        const denominator = @as(u32, self.reference) * 2;
        const numerator = (@as(i64, coordinate) * 2 + 1) * self.source - self.reference;
        if (numerator <= 0) return .{ .lower = 0, .upper = 0, .upper_weight = 0, .denominator = denominator };
        const last = self.source - 1;
        if (numerator >= @as(i64, last) * denominator) return .{ .lower = last, .upper = last, .upper_weight = 0, .denominator = denominator };
        const lower: u16 = @intCast(@divFloor(numerator, denominator));
        return .{ .lower = lower, .upper = lower + 1, .upper_weight = @intCast(@mod(numerator, denominator)), .denominator = denominator };
    }
};
