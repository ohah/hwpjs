/// Exact power when <=limit; null certifies that the result exceeds limit.
pub fn bounded(base: u128, exponent: u32, limit: u128) ?u128 {
    var result: u128 = 1;
    var factor = base;
    var remaining = exponent;
    if (exponent == 0) return if (limit >= 1) 1 else null;
    if (base == 0) return 0;
    if (base > limit) return null;
    while (remaining != 0) {
        if (remaining & 1 != 0) {
            const product = @mulWithOverflow(result, factor);
            if (product[1] != 0 or product[0] > limit) return null;
            result = product[0];
        }
        remaining >>= 1;
        if (remaining != 0) {
            const square = @mulWithOverflow(factor, factor);
            if (square[1] != 0 or square[0] > limit) return null;
            factor = square[0];
        }
    }
    return result;
}

/// Exact positive integer nth root, or null when the input is not a perfect power.
pub fn root(value: u128, degree: u32) ?u128 {
    if (degree == 0 or value == 0) return null;
    if (value == 1 or degree == 1) return value;
    if (degree >= 128) return null; // 2^degree already exceeds every u128 input.
    var lo: u128 = 1;
    var hi: u128 = value;
    while (lo <= hi) {
        const mid = lo + (hi - lo) / 2;
        if (bounded(mid, degree, value)) |power| {
            if (power == value) return mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return null;
}
