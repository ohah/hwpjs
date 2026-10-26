export function createdTableIdentity(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value))
    throw new RangeError('InvalidCreatedTableIdentity');
  const id = BigInt(value);
  if (id > 18446744073709551615n) throw new RangeError('InvalidCreatedTableIdentity');
  return id;
}
