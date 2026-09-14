// Business rules shared by the API and the web client, so the two cannot disagree.
// Rule IDs in the comments (R-xx) match docs/SPEC.md.

export const SENDER_ACCOUNT = '1000000001';
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 50_000;

// User-facing text for every rule. Tests assert on these exact strings.
export const MESSAGES = {
  RECIPIENT_REQUIRED: 'Enter a recipient account.',
  RECIPIENT_FORMAT: 'Account number must be 10 digits.',
  SAME_ACCOUNT: 'You cannot transfer to your own account.',
  AMOUNT_REQUIRED: 'Enter an amount.',
  AMOUNT_NOT_INTEGER: 'Amount must be a whole number.',
  AMOUNT_TOO_SMALL: 'Amount must be at least 1.',
  AMOUNT_TOO_LARGE: 'Amount cannot exceed 50,000 per transfer.',
  RECIPIENT_NOT_FOUND: 'Recipient account not found.',
  INSUFFICIENT_FUNDS: 'Insufficient balance.',
  UNEXPECTED: 'Something went wrong. Please try again.',
};

const ACCOUNT_PATTERN = /^\d{10}$/;

// R-01..R-03. Returns the first problem code, or null.
export function checkRecipient(raw, sender) {
  if (raw === undefined || raw === null) return 'RECIPIENT_REQUIRED';
  if (typeof raw !== 'string') return 'RECIPIENT_FORMAT';
  const value = raw.trim();
  if (value === '') return 'RECIPIENT_REQUIRED';
  if (!ACCOUNT_PATTERN.test(value)) return 'RECIPIENT_FORMAT';
  if (value === sender) return 'SAME_ACCOUNT';
  return null;
}

// R-04..R-07. `amount` is a number (or undefined when nothing was entered).
export function checkAmount(amount) {
  if (amount === undefined || amount === null) return 'AMOUNT_REQUIRED';
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return 'AMOUNT_NOT_INTEGER';
  if (amount < MIN_AMOUNT) return 'AMOUNT_TOO_SMALL';
  if (amount > MAX_AMOUNT) return 'AMOUNT_TOO_LARGE';
  return null;
}

// Turns the text in the amount box into what checkAmount expects.
// "" -> undefined, "0100" -> 100, "-5" -> -5, "10.5" / "1,000" / "abc" -> NaN.
export function parseAmountInput(text) {
  const value = String(text ?? '').trim();
  if (value === '') return undefined;
  if (!/^-?\d+$/.test(value)) return NaN;
  return Number(value);
}
