// The whole UI: one transfer form. Behaviour is specified in docs/SPEC.md section 5.
import { useEffect, useState } from 'react';
import {
  MESSAGES,
  SENDER_ACCOUNT,
  checkAmount,
  checkRecipient,
  parseAmountInput,
} from '../../shared/rules.js';

const formatTwd = (value) => value.toLocaleString('en-US');

export default function App() {
  const [account, setAccount] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/accounts/${SENDER_ACCOUNT}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setAccount)
      .catch(() => setLoadFailed(true));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setResult(null);

    // Client-side checks first (SPEC U-04); the API repeats them regardless.
    const amountValue = parseAmountInput(amount);
    const errors = {
      recipient: checkRecipient(recipient, SENDER_ACCOUNT),
      amount: checkAmount(amountValue),
    };
    setFieldErrors(errors);
    if (errors.recipient || errors.amount) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fromAccount: SENDER_ACCOUNT,
          toAccount: recipient.trim(),
          amount: amountValue,
        }),
      });
      const body = await response.json().catch(() => null);

      if (response.status === 201) {
        setAccount((current) => ({ ...current, balance: body.balanceAfter }));
        setResult({
          kind: 'success',
          text: `Sent ${formatTwd(body.amount)} TWD to ${body.toAccount}. Reference: ${body.id}`,
        });
        setRecipient('');
        setAmount('');
      } else {
        const code = body?.error?.code;
        setResult({ kind: 'error', text: MESSAGES[code] ?? MESSAGES.UNEXPECTED });
      }
    } catch {
      setResult({ kind: 'error', text: MESSAGES.UNEXPECTED });
    } finally {
      setSubmitting(false);
    }
  }

  let balanceText = 'Loading...';
  if (account) balanceText = `${formatTwd(account.balance)} TWD`;
  else if (loadFailed) balanceText = 'Unavailable';

  return (
    <main>
      <h1>Quick Transfer</h1>

      <section aria-label="Your account">
        <p>
          From: <span data-testid="sender-account">{SENDER_ACCOUNT}</span>
        </p>
        <p>
          Available balance: <span data-testid="balance">{balanceText}</span>
        </p>
      </section>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="recipient">Recipient account</label>
        <input
          id="recipient"
          name="recipient"
          inputMode="numeric"
          autoComplete="off"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          aria-invalid={Boolean(fieldErrors.recipient)}
          aria-describedby={fieldErrors.recipient ? 'recipient-error' : undefined}
        />
        {fieldErrors.recipient && (
          <p id="recipient-error" className="field-error">
            {MESSAGES[fieldErrors.recipient]}
          </p>
        )}

        <label htmlFor="amount">Amount (TWD)</label>
        <input
          id="amount"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={Boolean(fieldErrors.amount)}
          aria-describedby={fieldErrors.amount ? 'amount-error' : undefined}
        />
        {fieldErrors.amount && (
          <p id="amount-error" className="field-error">
            {MESSAGES[fieldErrors.amount]}
          </p>
        )}

        <button type="submit" disabled={submitting || !account}>
          {submitting ? 'Sending...' : 'Transfer'}
        </button>
      </form>

      {result && (
        <p role={result.kind === 'success' ? 'status' : 'alert'} className={result.kind}>
          {result.text}
        </p>
      )}
    </main>
  );
}
