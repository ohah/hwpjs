pub const Side = enum { lower, upper };
/// F.1(a) policy only. Caller proves a complete preimage and domain-end equality.
pub fn select(upper_is_domain_end: bool, lower_attained: bool, upper_attained: bool) !Side {
    if (upper_is_domain_end and upper_attained) {
        if (!lower_attained) return error.UnattainedIccPreimageMinimum;
        return .lower;
    }
    if (!upper_attained) return error.UnattainedIccPreimageMaximum;
    return .upper;
}
