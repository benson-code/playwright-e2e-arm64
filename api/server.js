// Minimal transfer API on node:http - no framework, no database, no dependencies.
// Contract: docs/SPEC.md section 6.
import http from 'node:http';
import { MESSAGES, checkAmount, checkRecipient } from '../shared/rules.js';

const HOST = process.env.API_HOST ?? '127.0.0.1';
const PORT = Number(process.env.API_PORT ?? 8281);
// POST /api/test/reset exists only when this is set. Never enable it outside tests.
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';
const MAX_BODY_BYTES = 10_000;

const SEED = [
  { id: '1000000001', owner: 'Alice Chen', balance: 30_000 },
  { id: '1000000002', owner: 'Bob Lin', balance: 5_000 },
  { id: '1000000003', owner: 'Carol Wu', balance: 0 },
];

const ERROR_MESSAGES = {
  ...MESSAGES,
  ACCOUNT_NOT_FOUND: 'Account not found.',
  SENDER_NOT_FOUND: 'Sender account not found.',
  INVALID_JSON: 'Request body must be a JSON object.',
  PAYLOAD_TOO_LARGE: 'Request body is too large.',
  NOT_FOUND: 'No such endpoint.',
  INTERNAL_ERROR: MESSAGES.UNEXPECTED,
};

let accounts;
let transfers;

function resetData() {
  accounts = new Map(SEED.map((account) => [account.id, { ...account }]));
  transfers = [];
}

class HttpError extends Error {
  constructor(status, code, field) {
    super(code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res, { status, code, field }) {
  const error = { code, message: ERROR_MESSAGES[code] };
  if (field) error.field = field;
  send(res, status, { error });
}

// Reads the whole body. An oversized body is drained, not cut off, so the 413 still reaches the client.
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'PAYLOAD_TOO_LARGE'));
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Check order is part of the contract (SPEC 6.3): only the first failure is reported.
async function createTransfer(req, res) {
  const { fromAccount, toAccount, amount } = await readJson(req);

  const sender = typeof fromAccount === 'string' ? accounts.get(fromAccount) : undefined;
  if (!sender) throw new HttpError(404, 'SENDER_NOT_FOUND', 'fromAccount');

  const recipientProblem = checkRecipient(toAccount, sender.id);
  if (recipientProblem) throw new HttpError(400, recipientProblem, 'toAccount');

  const amountProblem = checkAmount(amount);
  if (amountProblem) throw new HttpError(400, amountProblem, 'amount');

  const recipient = accounts.get(toAccount.trim());
  if (!recipient) throw new HttpError(404, 'RECIPIENT_NOT_FOUND', 'toAccount');

  if (amount > sender.balance) throw new HttpError(422, 'INSUFFICIENT_FUNDS', 'amount');

  // Both balances change in the same synchronous block, so no request can see half a transfer.
  sender.balance -= amount;
  recipient.balance += amount;
  const transfer = {
    id: `TX-${String(transfers.length + 1).padStart(6, '0')}`,
    fromAccount: sender.id,
    toAccount: recipient.id,
    amount,
    balanceAfter: sender.balance,
    createdAt: new Date().toISOString(),
  };
  transfers.push(transfer);
  send(res, 201, transfer);
}

async function route(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { status: 'ok' });
  }

  const accountMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (req.method === 'GET' && accountMatch) {
    const account = accounts.get(accountMatch[1]);
    if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND');
    return send(res, 200, account);
  }

  if (req.method === 'POST' && pathname === '/api/transfers') {
    return createTransfer(req, res);
  }

  if (TEST_HOOKS && req.method === 'POST' && pathname === '/api/test/reset') {
    resetData();
    return send(res, 204);
  }

  throw new HttpError(404, 'NOT_FOUND');
}

resetData();

http
  .createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err);
      console.error(err);
      sendError(res, { status: 500, code: 'INTERNAL_ERROR' });
    }
  })
  .listen(PORT, HOST, () => {
    console.log(`API listening on http://${HOST}:${PORT}${TEST_HOOKS ? ' (test hooks enabled)' : ''}`);
  });
