import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';
import multer from 'multer';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = Number(process.env.PORT || 5001);
const DEFAULT_FRONTEND_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'https://in-terpay.web.app',
  'https://in-terpay.firebaseapp.com',
].join(',');
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGINS;
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '').toLowerCase();
const FRONTEND_ORIGINS = new Set(FRONTEND_ORIGIN.split(',').map(normalizeOrigin).filter(Boolean));
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
let MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'sswi';

if (MONGODB_DB_NAME.startsWith('mongodb://') || MONGODB_DB_NAME.startsWith('mongodb+srv://')) {
  MONGODB_URI = MONGODB_DB_NAME;
  MONGODB_DB_NAME = 'sswi';
}

const INTERSWITCH = {
  merchantCode: process.env.INTERSWITCH_MERCHANT_CODE || 'MX275874',
  payItemId: process.env.INTERSWITCH_PAY_ITEM_ID || 'Default_Payable_MX275874',
  clientId: process.env.INTERSWITCH_CLIENT_ID || '',
  secretKey: process.env.INTERSWITCH_SECRET_KEY || '',
  mode: process.env.INTERSWITCH_MODE === 'LIVE' ? 'LIVE' : 'TEST',
  inlineCheckoutScriptUrl:
    process.env.INTERSWITCH_INLINE_SCRIPT_URL || 'https://newwebpay.qa.interswitchng.com/inline-checkout.js',
  redirectCheckoutUrl:
    process.env.INTERSWITCH_REDIRECT_URL || 'https://newwebpay.qa.interswitchng.com/checkout',
};

// Configure Cloudinary for profile picture uploads
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (FRONTEND_ORIGINS.has(normalizeOrigin(origin))) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true }));

const defaultTrustScore = {
  overall: 450,
  transactionVolume: 60,
  savingsDiscipline: 50,
  escrowReliability: 70,
  billPaymentConsistency: 55,
};

const db = {
  users: [],
  transactions: [],
  escrows: [],
  requests: [],
  disputes: [],
  notifications: [],
  paycodes: [],
  userStates: new Map(),
  accountStates: new Map(),
};

const mongo = {
  client: null,
  database: null,
};

let persistTimer = null;
let persistInProgress = false;
let persistQueued = false;
let shuttingDown = false;

const ok = (res, data, extra = {}) => res.json({ data, ...extra });

const fail = (res, status, message) => res.status(status).json({ message });

const nowIso = () => new Date().toISOString();

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);

const flushToMongo = async () => {
  if (!mongo.database) return;

  if (persistInProgress) {
    persistQueued = true;
    return;
  }

  persistInProgress = true;
  persistQueued = false;

  try {
    const collections = {
      users: db.users,
      transactions: db.transactions,
      escrows: db.escrows,
      requests: db.requests,
      disputes: db.disputes,
      notifications: db.notifications,
      paycodes: db.paycodes,
      userStates: Array.from(db.userStates.entries()).map(([userId, state]) => ({ userId, ...state })),
      accountStates: Array.from(db.accountStates.entries()).map(([userId, state]) => ({ userId, ...state })),
    };

    const names = Object.keys(collections);
    for (const name of names) {
      const docs = collections[name];
      const collection = mongo.database.collection(name);
      await collection.deleteMany({});
      if (docs.length > 0) {
        await collection.insertMany(docs);
      }
    }
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.toLowerCase().includes('client was closed')) {
      console.error('MongoDB flush failed:', error);
    }
  } finally {
    persistInProgress = false;
    if (persistQueued) {
      persistQueued = false;
      void flushToMongo();
    }
  }
};

const markDirty = () => {
  if (!mongo.database) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushToMongo();
  }, 250);
};

const loadFromMongo = async () => {
  mongo.client = new MongoClient(MONGODB_URI);
  await mongo.client.connect();
  mongo.database = mongo.client.db(MONGODB_DB_NAME);

  const [
    users,
    transactions,
    escrows,
    requests,
    disputes,
    notifications,
    paycodes,
    userStates,
    accountStates,
  ] = await Promise.all([
    mongo.database.collection('users').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('transactions').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('escrows').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('requests').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('disputes').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('notifications').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('paycodes').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('userStates').find({}, { projection: { _id: 0 } }).toArray(),
    mongo.database.collection('accountStates').find({}, { projection: { _id: 0 } }).toArray(),
  ]);

  db.users = users;
  db.transactions = transactions;
  db.escrows = escrows;
  db.requests = requests;
  db.disputes = disputes;
  db.notifications = notifications;
  db.paycodes = paycodes;
  db.userStates = new Map(userStates.map(({ userId, ...state }) => [userId, state]));
  db.accountStates = new Map(accountStates.map(({ userId, ...state }) => [userId, state]));

  console.log(`MongoDB connected: ${MONGODB_DB_NAME}`);
};

const normalizeUser = (user) => {
  const { password, pin, ...safe } = user;
  return safe;
};

const createToken = (user) => jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

const createAccountNumber = () => `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
const createWalletId = () => `WAL-${Math.floor(1000000000 + Math.random() * 9000000000)}`;

const ensureUniqueAccountNumber = (preferred) => {
  const requested = String(preferred || '').trim();
  if (requested && !db.users.some((entry) => entry.accountNumber === requested)) {
    return requested;
  }

  let next = createAccountNumber();
  while (db.users.some((entry) => entry.accountNumber === next)) {
    next = createAccountNumber();
  }
  return next;
};

const getDefaultState = () => ({
  escrows: [],
  savingsGroups: [],
  userRequests: [],
  loans: [],
  trustScore: { ...defaultTrustScore },
  paycodeHistory: [],
  lockedFunds: [],
});

const getUserState = (userId) => {
  if (!db.userStates.has(userId)) {
    db.userStates.set(userId, getDefaultState());
    markDirty();
  }
  return db.userStates.get(userId);
};

const toLower = (value) => String(value || '').trim().toLowerCase();

const matchesAjoHandle = (user, handle) => {
  const normalizedHandle = toLower(handle);
  if (!normalizedHandle) return false;
  return toLower(user.ajoUsername) === normalizedHandle || toLower(user.username) === normalizedHandle;
};

const getAjoParticipantUserIds = (group) => {
  const handles = new Set([
    toLower(group?.creatorUsername),
    ...(Array.isArray(group?.members) ? group.members.map((member) => toLower(member?.ajoUsername)) : []),
  ].filter(Boolean));

  return new Set(
    db.users
      .filter((user) => {
        const userAjo = toLower(user.ajoUsername);
        const userUsername = toLower(user.username);
        return handles.has(userAjo) || handles.has(userUsername);
      })
      .map((user) => user.id),
  );
};

const syncAjoGroupAcrossParticipants = (group) => {
  const participantIds = getAjoParticipantUserIds(group);

  for (const user of db.users) {
    const state = getUserState(user.id);
    const withoutCurrent = state.savingsGroups.filter((entry) => entry.id !== group.id);

    if (participantIds.has(user.id)) {
      state.savingsGroups = [...withoutCurrent, group];
    } else {
      state.savingsGroups = withoutCurrent;
    }
  }
};

const removeAjoGroupAcrossAllStates = (groupId) => {
  for (const user of db.users) {
    const state = getUserState(user.id);
    state.savingsGroups = state.savingsGroups.filter((entry) => entry.id !== groupId);
  }
};

const getExistingAjoGroupById = (groupId) => {
  if (!groupId) return null;

  for (const state of db.userStates.values()) {
    const match = (state?.savingsGroups || []).find((entry) => entry.id === groupId);
    if (match) return match;
  }

  return null;
};

const countPaidAjoContributions = (group) => {
  if (!group || !Array.isArray(group.members)) return 0;
  return group.members.reduce((sum, member) => (
    sum + (member?.contributions || []).filter((contribution) => (
      contribution?.status === 'paid' && contribution?.memberUsername !== '__PAYOUT__'
    )).length
  ), 0);
};

const getBalanceState = (userId) => {
  if (!db.accountStates.has(userId)) {
    db.accountStates.set(userId, { balance: 100000 });
    markDirty();
  }
  return db.accountStates.get(userId);
};

const addNotification = (userId, type, title, message, data = {}) => {
  const timestamp = nowIso();
  db.notifications.unshift({
    id: nanoid(),
    userId,
    type,
    title,
    message,
    data,
    read: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  markDirty();
};

const authRequired = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return fail(res, 401, 'Unauthorized');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((entry) => entry.id === payload.userId);
    if (!user) return fail(res, 401, 'Unauthorized');
    req.user = user;
    next();
  } catch (_error) {
    return fail(res, 401, 'Unauthorized');
  }
};

app.get('/health', (_req, res) => ok(res, { status: 'ok' }));

app.get('/api/users/exists', (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const exists = db.users.some((user) => normalizePhone(user.phone) === phone);
  return ok(res, { exists });
});

app.post('/api/users/register', (req, res) => {
  const payload = req.body || {};
  const required = ['firstName', 'lastName', 'phone', 'email', 'username', 'password', 'pin'];
  const normalizedPhone = normalizePhone(payload.phone);

  for (const key of required) {
    if (!String(payload[key] || '').trim()) {
      return fail(res, 400, `${key} is required`);
    }
  }

  if (normalizedPhone.length !== 10) {
    return fail(res, 400, 'phone must contain 10 digits');
  }

  if (db.users.some((u) => normalizePhone(u.phone) === normalizedPhone)) {
    return fail(res, 409, 'Phone already exists');
  }

  if (db.users.some((u) => u.username.toLowerCase() === String(payload.username).toLowerCase())) {
    return fail(res, 409, 'Username already exists');
  }

  const createdAt = nowIso();
  const accountNumber = ensureUniqueAccountNumber(payload.accountNumber);
  const user = {
    id: nanoid(),
    firstName: String(payload.firstName),
    lastName: String(payload.lastName),
    phone: normalizedPhone,
    email: String(payload.email),
    age: String(payload.age || ''),
    username: String(payload.username),
    password: String(payload.password),
    pin: String(payload.pin),
    nin: payload.nin ? String(payload.nin) : undefined,
    accountNumber,
    walletId: payload.walletId || createWalletId(),
    createdAt,
    faceVerified: Boolean(payload.faceVerified),
    ajoUsername: payload.ajoUsername,
    profileImage: payload.profileImage,
    ajoActivated: Boolean(payload.ajoActivated),
    piggyActivated: Boolean(payload.piggyActivated),
    escrowActivated: Boolean(payload.escrowActivated),
    escrowWalletId: payload.escrowWalletId,
    lockedFunds: Array.isArray(payload.lockedFunds) ? payload.lockedFunds : [],
  };

  db.users.push(user);
  getUserState(user.id).lockedFunds = [...(user.lockedFunds || [])];
  markDirty();

  const token = createToken(user);
  addNotification(user.id, 'alert', 'Welcome', 'Your account has been created successfully.');
  return res.status(201).json({ data: normalizeUser(user), token });
});

app.post('/api/users/login', (req, res) => {
  const payload = req.body || {};
  const phone = normalizePhone(payload.phone);
  const username = String(payload.username || '').trim().toLowerCase();

  const user = db.users.find(
    (entry) => normalizePhone(entry.phone) === phone || entry.username.toLowerCase() === username,
  );

  if (!user) return fail(res, 401, 'Invalid credentials');
  if (String(payload.password || '') !== user.password || String(payload.pin || '') !== user.pin) {
    return fail(res, 401, 'Invalid credentials');
  }

  const token = createToken(user);
  return ok(res, normalizeUser(user), { token });
});

app.get('/api/users/by-account/:accountNumber', authRequired, (req, res) => {
  const accountNumber = String(req.params.accountNumber || '');
  const matches = db.users.filter((entry) => entry.accountNumber === accountNumber);
  if (matches.length === 0) return fail(res, 404, 'User not found');
  if (matches.length > 1) return fail(res, 409, 'Account number conflict detected. Please contact support.');

  const user = matches[0];

  return ok(res, {
    id: user.id,
    accountNumber: user.accountNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    walletId: user.walletId,
  });
});

app.get('/api/users/by-username/:username', authRequired, (req, res) => {
  const username = String(req.params.username || '').toLowerCase();
  const user = db.users.find((entry) => entry.username.toLowerCase() === username);
  if (!user) return fail(res, 404, 'User not found');

  return ok(res, {
    id: user.id,
    accountNumber: user.accountNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    walletId: user.walletId,
    username: user.username,
    ajoUsername: user.ajoUsername,
    ajoActivated: user.ajoActivated,
  });
});

app.get('/api/users/search', authRequired, (req, res) => {
  const query = String(req.query.query || '').trim().toLowerCase();
  if (query.length < 2) return ok(res, []);

  const data = db.users
    .filter((user) => user.username.toLowerCase().includes(query))
    .slice(0, 15)
    .map((user) => ({
      id: user.id,
      accountNumber: user.accountNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      walletId: user.walletId,
      username: user.username,
      ajoUsername: user.ajoUsername,
      ajoActivated: user.ajoActivated,
    }));

  return ok(res, data);
});

app.patch('/api/users/me/preferences', authRequired, (req, res) => {
  const payload = req.body || {};
  const fields = ['ajoActivated', 'ajoUsername', 'piggyActivated', 'escrowActivated', 'escrowWalletId'];

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      req.user[field] = payload[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'pin')) {
    req.user.pin = String(payload.pin);
  }

  markDirty();

  return ok(res, normalizeUser(req.user));
});

app.get('/api/users/me/state', authRequired, (req, res) => {
  const state = getUserState(req.user.id);
  return ok(res, state);
});

app.put('/api/users/me/state', authRequired, (req, res) => {
  const payload = req.body || {};
  const previous = getUserState(req.user.id);

  const next = {
    ...previous,
    ...payload,
    trustScore: payload.trustScore || previous.trustScore || { ...defaultTrustScore },
    escrows: payload.escrows || previous.escrows,
    savingsGroups: payload.savingsGroups || previous.savingsGroups,
    userRequests: payload.userRequests || previous.userRequests,
    loans: payload.loans || previous.loans,
    paycodeHistory: payload.paycodeHistory || previous.paycodeHistory,
    lockedFunds: payload.lockedFunds || previous.lockedFunds,
  };

  db.userStates.set(req.user.id, next);
  markDirty();
  return ok(res, next);
});

app.put('/api/users/ajo/groups/:groupId/sync', authRequired, (req, res) => {
  const { group } = req.body || {};
  if (!group || !group.id) return fail(res, 400, 'group is required');

  const requesterInGroup =
    toLower(group.creatorUsername) === toLower(req.user.ajoUsername)
    || toLower(group.creatorUsername) === toLower(req.user.username)
    || (Array.isArray(group.members)
      && group.members.some((member) => matchesAjoHandle(req.user, member?.ajoUsername)));

  if (!requesterInGroup) {
    return fail(res, 403, 'You can only sync groups you belong to');
  }

  const hasPendingInvitees = Array.isArray(group.members) && group.members.some((member) => !member?.accepted);
  const previousGroup = getExistingAjoGroupById(group.id);
  const previousPaidCount = countPaidAjoContributions(previousGroup);
  const nextPaidCount = countPaidAjoContributions(group);

  if (hasPendingInvitees && nextPaidCount > previousPaidCount) {
    return fail(res, 409, 'All invited members must accept or decline before contribution payment.');
  }

  syncAjoGroupAcrossParticipants(group);
  markDirty();

  return ok(res, getUserState(req.user.id));
});

app.delete('/api/users/ajo/groups/:groupId/sync', authRequired, (req, res) => {
  const groupId = String(req.params.groupId || '');
  removeAjoGroupAcrossAllStates(groupId);
  markDirty();
  return ok(res, getUserState(req.user.id));
});

app.post('/api/transactions', authRequired, (req, res) => {
  const payload = req.body || {};
  const idempotencyKey = String(payload.idempotencyKey || '');

  if (!idempotencyKey) return fail(res, 400, 'idempotencyKey is required');

  const existing = db.transactions.find((tx) => tx.idempotencyKey === idempotencyKey);
  if (existing) return ok(res, existing);

  const tx = {
    id: nanoid(),
    idempotencyKey,
    type: String(payload.type || 'bills'),
    amount: Number(payload.amount || 0),
    senderAccount: String(payload.senderAccount || ''),
    receiverAccount: String(payload.receiverAccount || ''),
    senderName: String(payload.senderName || ''),
    receiverName: String(payload.receiverName || ''),
    description: String(payload.description || ''),
    status: payload.status || 'success',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  db.transactions.unshift(tx);
  addNotification(req.user.id, 'transaction', 'Transaction recorded', `Transaction ${tx.id} was created.`, {
    transactionId: tx.id,
  });
  markDirty();

  return res.status(201).json({ data: tx });
});

app.post('/api/transactions/commit', authRequired, (req, res) => {
  const payload = req.body || {};
  const expectedBalance = Number(payload.expectedBalance);
  const nextBalance = Number(payload.nextBalance);
  const txPayload = payload.transaction || {};

  if (!Number.isFinite(nextBalance)) return fail(res, 400, 'nextBalance is required');

  const accountState = getBalanceState(req.user.id);
  if (Number.isFinite(expectedBalance) && accountState.balance !== expectedBalance) {
    return fail(res, 409, 'Balance changed. Please retry.');
  }

  accountState.balance = nextBalance;

  const tx = {
    id: nanoid(),
    idempotencyKey: String(txPayload.idempotencyKey || nanoid()),
    type: String(txPayload.type || 'bills'),
    amount: Number(txPayload.amount || 0),
    senderAccount: String(txPayload.senderAccount || ''),
    receiverAccount: String(txPayload.receiverAccount || ''),
    senderName: String(txPayload.senderName || ''),
    receiverName: String(txPayload.receiverName || ''),
    description: String(txPayload.description || ''),
    status: txPayload.status || 'success',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  db.transactions.unshift(tx);
  markDirty();
  return ok(res, { transaction: tx, balance: accountState.balance });
});

app.get('/api/transactions', authRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 500), 1), 1000);
  return ok(res, db.transactions.slice(0, limit));
});

app.get('/api/transactions/:id', authRequired, (req, res) => {
  const tx = db.transactions.find((entry) => entry.id === req.params.id);
  if (!tx) return fail(res, 404, 'Transaction not found');
  return ok(res, tx);
});

app.get('/api/interswitch/config', (_req, res) => {
  return ok(res, {
    merchantCode: INTERSWITCH.merchantCode,
    payItemId: INTERSWITCH.payItemId,
    mode: INTERSWITCH.mode,
    inlineCheckoutScriptUrl: INTERSWITCH.inlineCheckoutScriptUrl,
    redirectCheckoutUrl: INTERSWITCH.redirectCheckoutUrl,
  });
});

app.post('/api/interswitch/pay-bill', authRequired, (req, res) => {
  const payload = req.body || {};
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Valid amount is required');

  const transactionReference = `ISW-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  return ok(res, {
    transactionReference,
    merchantCode: INTERSWITCH.merchantCode,
    payItemId: INTERSWITCH.payItemId,
    amount,
    currencyCode: payload.currencyCode || '566',
    checkoutUrl: `${INTERSWITCH.redirectCheckoutUrl}?txnref=${encodeURIComponent(transactionReference)}`,
    redirectUrl: payload.redirectUrl,
    clientId: INTERSWITCH.clientId,
  });
});

app.get('/api/interswitch/verify', authRequired, (req, res) => {
  const transactionReference = String(req.query.transactionReference || '');
  const amount = String(req.query.amount || '0');
  if (!transactionReference) return fail(res, 400, 'transactionReference is required');

  return ok(res, {
    transactionReference,
    amount,
    status: 'SUCCESSFUL',
    responseCode: '00',
    responseDescription: 'Approved or completed successfully',
    verifiedAt: nowIso(),
  });
});

app.get('/api/requests', authRequired, (_req, res) => {
  const mine = db.requests.filter((entry) => (
    entry.requesterId === _req.user.id || entry.requestedFromAccount === _req.user.accountNumber
  ));
  return ok(res, mine);
});

app.post('/api/requests', authRequired, (req, res) => {
  const payload = req.body || {};
  const recipient = db.users.find((user) => user.accountNumber === payload.requestedFromAccount);
  if (!recipient) return fail(res, 404, 'Recipient account not found');

  const created = {
    id: nanoid(),
    requesterId: req.user.id,
    requestedFromUserId: recipient.id,
    requesterName: `${req.user.firstName} ${req.user.lastName}`.trim(),
    requesterPhone: payload.requesterPhone,
    requestedFromAccount: recipient.accountNumber,
    requestedFromName: `${recipient.firstName} ${recipient.lastName}`.trim(),
    type: payload.type,
    network: payload.network,
    amount: Number(payload.amount || 0),
    note: payload.note,
    status: 'pending',
    createdAt: nowIso(),
  };

  db.requests.unshift(created);
  addNotification(recipient.id, 'alert', 'New request', 'You have a new payment request.', {
    requestId: created.id,
  });
  markDirty();

  return res.status(201).json({ data: created });
});

app.patch('/api/requests/:id/respond', authRequired, (req, res) => {
  const requestItem = db.requests.find((entry) => entry.id === req.params.id);
  if (!requestItem) return fail(res, 404, 'Request not found');

  if (requestItem.requestedFromAccount !== req.user.accountNumber) {
    return fail(res, 403, 'You can only respond to requests sent to your account');
  }

  if (requestItem.status !== 'pending') {
    return fail(res, 400, 'This request has already been handled');
  }

  const action = String(req.body.action || '');
  if (action !== 'approve' && action !== 'decline') return fail(res, 400, 'Invalid action');

  const respondedAmount = Number(req.body.amount || requestItem.amount || 0);
  if (!Number.isFinite(respondedAmount) || respondedAmount <= 0) {
    return fail(res, 400, 'Valid amount is required');
  }

  const responderBalance = getBalanceState(req.user.id);
  if (action === 'approve' && responderBalance.balance < respondedAmount) {
    return fail(res, 400, 'Insufficient balance');
  }

  requestItem.status = action === 'approve' ? 'approved' : 'declined';
  requestItem.respondedAmount = respondedAmount;
  requestItem.responderName = `${req.user.firstName} ${req.user.lastName}`.trim();
  requestItem.respondedAt = nowIso();

  if (action === 'approve') {
    responderBalance.balance -= requestItem.respondedAmount;

    if (requestItem.requesterId) {
      const requesterBalance = getBalanceState(requestItem.requesterId);
      requesterBalance.balance += requestItem.respondedAmount;
    }
  }

  markDirty();

  return ok(res, { request: requestItem, balance: responderBalance.balance });
});

app.get('/api/escrows', authRequired, (_req, res) => {
  const mine = db.escrows.filter((entry) => (
    entry.buyerUserId === _req.user.id ||
    entry.sellerUserId === _req.user.id ||
    entry.buyerWalletId === _req.user.escrowWalletId ||
    entry.sellerWalletId === _req.user.escrowWalletId
  ));
  return ok(res, mine);
});

app.post('/api/escrows', authRequired, (req, res) => {
  const payload = req.body || {};
  const seller = db.users.find((user) => (
    user.escrowWalletId === payload.sellerWalletId || user.walletId === payload.sellerWalletId
  ));
  if (!seller) return fail(res, 404, 'Seller wallet not found');

  if (!req.user.escrowWalletId) return fail(res, 400, 'Buyer escrow wallet is not configured');
  if (!seller.escrowWalletId) return fail(res, 400, 'Seller escrow wallet is not configured');
  if (seller.id === req.user.id) return fail(res, 400, 'You cannot create escrow with yourself');

  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Valid amount is required');

  const balanceState = getBalanceState(req.user.id);
  if (balanceState.balance < amount) return fail(res, 400, 'Insufficient balance');

  balanceState.balance -= amount;

  const escrow = {
    id: nanoid(),
    buyerUserId: req.user.id,
    sellerUserId: seller.id,
    buyerWalletId: req.user.escrowWalletId,
    buyerName: `${req.user.firstName} ${req.user.lastName}`.trim(),
    sellerWalletId: seller.escrowWalletId,
    sellerName: `${seller.firstName} ${seller.lastName}`.trim(),
    amount,
    description: String(payload.description || ''),
    deliveryDeadline: String(payload.deliveryDeadline || ''),
    status: 'pending_acceptance',
    createdAt: nowIso(),
    penalty: 0,
  };

  db.escrows.unshift(escrow);
  markDirty();
  return res.status(201).json({ data: { escrow, balance: balanceState.balance } });
});

app.patch('/api/escrows/:id', authRequired, (req, res) => {
  const escrow = db.escrows.find((entry) => entry.id === req.params.id);
  if (!escrow) return fail(res, 404, 'Escrow not found');

  const action = String(req.body.action || '');
  const timestamp = nowIso();

  const nextStatusByAction = {
    accept: 'pending_delivery',
    decline: 'cancelled',
    cancel: 'cancelled',
    release: 'released',
    dispute: 'disputed',
    'resolve-release': 'released',
    'resolve-refund': 'cancelled',
  };

  if (!nextStatusByAction[action]) {
    return fail(res, 400, 'Invalid action');
  }

  const isBuyer = escrow.buyerUserId === req.user.id || escrow.buyerWalletId === req.user.escrowWalletId;
  const isSeller = escrow.sellerUserId === req.user.id || escrow.sellerWalletId === req.user.escrowWalletId;

  if (action === 'accept' || action === 'decline') {
    if (!isSeller) return fail(res, 403, 'Only seller can perform this action');
    if (escrow.status !== 'pending_acceptance') return fail(res, 400, 'Escrow is not awaiting acceptance');
  }

  if (action === 'cancel') {
    if (!isBuyer) return fail(res, 403, 'Only buyer can cancel this escrow');
    if (escrow.status !== 'pending_acceptance') return fail(res, 400, 'Escrow cannot be cancelled at this stage');
  }

  if (action === 'release') {
    if (!isBuyer) return fail(res, 403, 'Only buyer can release this escrow');
    if (escrow.status !== 'pending_delivery') return fail(res, 400, 'Escrow is not ready for release');
  }

  if (action === 'dispute') {
    if (!isBuyer && !isSeller) return fail(res, 403, 'Only escrow participants can dispute');
    if (escrow.status !== 'pending_delivery') return fail(res, 400, 'Escrow is not in delivery stage');
  }

  if (action === 'resolve-release' || action === 'resolve-refund') {
    if (!isBuyer && !isSeller) return fail(res, 403, 'Only escrow participants can resolve this dispute');
    if (escrow.status !== 'disputed') return fail(res, 400, 'Escrow is not disputed');
  }

  escrow.status = nextStatusByAction[action];

  if (escrow.status === 'cancelled') {
    const buyerBalance = getBalanceState(escrow.buyerUserId);
    buyerBalance.balance += Number(escrow.amount || 0);
  }

  if (escrow.status === 'released') {
    const sellerBalance = getBalanceState(escrow.sellerUserId);
    sellerBalance.balance += Number(escrow.amount || 0);
    escrow.releasedAt = timestamp;
    escrow.sellerSettledAt = timestamp;
  }

  markDirty();

  return ok(res, { escrow });
});

app.get('/api/paycodes', authRequired, (_req, res) => {
  const mine = db.paycodes.filter((entry) => entry.userId === _req.user.id);
  return ok(res, mine);
});

app.post('/api/paycodes', authRequired, (req, res) => {
  const amount = Number(req.body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Valid amount is required');

  const accountState = getBalanceState(req.user.id);
  if (accountState.balance < amount) return fail(res, 400, 'Insufficient balance');

  accountState.balance -= amount;

  const paycode = {
    id: nanoid(),
    userId: req.user.id,
    code: `${Math.floor(100000 + Math.random() * 900000)}`,
    amount,
    status: 'active',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    createdAt: nowIso(),
  };

  db.paycodes.unshift(paycode);

  const state = getUserState(req.user.id);
  state.paycodeHistory = [
    {
      code: paycode.code,
      amount: paycode.amount,
      createdAt: paycode.createdAt,
      status: paycode.status,
      expiresAt: paycode.expiresAt,
    },
    ...state.paycodeHistory,
  ];

  markDirty();

  return res.status(201).json({ data: { paycode, balance: accountState.balance } });
});

app.patch('/api/paycodes/:id/cancel', authRequired, (req, res) => {
  const paycode = db.paycodes.find((entry) => entry.id === req.params.id);
  if (!paycode) return fail(res, 404, 'Paycode not found');

  if (paycode.userId !== req.user.id) {
    return fail(res, 403, 'You can only cancel your own paycode');
  }

  if (paycode.status === 'active') {
    paycode.status = 'cancelled';
    paycode.cancelledAt = nowIso();
    const accountState = getBalanceState(req.user.id);
    accountState.balance += Number(paycode.amount || 0);
  }

  markDirty();

  return ok(res, { paycode });
});

app.put('/api/users/me/profile-image', authRequired, upload.single('image'), async (req, res) => {
  if (!req.file) return fail(res, 400, 'image is required');

  try {
    // Upload to Cloudinary from buffer
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'sswi-profile-images',
          resource_type: 'auto',
          tags: [req.user.id, 'profile'],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const profileImage = result.secure_url;
    req.user.profileImage = profileImage;
    markDirty();

    return ok(res, { profileImage });
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    return fail(res, 500, 'Failed to upload image');
  }
});

app.get('/api/disputes', authRequired, (_req, res) => {
  return ok(res, db.disputes);
});

app.post('/api/disputes', authRequired, (req, res) => {
  const payload = req.body || {};
  if (!payload.transactionId || !payload.issue) {
    return fail(res, 400, 'transactionId and issue are required');
  }

  const dispute = {
    id: nanoid(),
    transactionId: String(payload.transactionId),
    issue: String(payload.issue),
    status: 'open',
    createdAt: nowIso(),
  };

  db.disputes.unshift(dispute);
  markDirty();
  return res.status(201).json({ data: dispute });
});

app.get('/api/users/me/account-state', authRequired, (req, res) => {
  return ok(res, getBalanceState(req.user.id));
});

app.put('/api/users/me/account-state/commit', authRequired, (req, res) => {
  const payload = req.body || {};
  const nextBalance = Number(payload.nextBalance);
  const expectedBalance = Number(payload.expectedBalance);

  if (!Number.isFinite(nextBalance)) return fail(res, 400, 'nextBalance is required');

  const account = getBalanceState(req.user.id);
  if (Number.isFinite(expectedBalance) && account.balance !== expectedBalance) {
    return fail(res, 409, 'Balance changed. Please retry.');
  }

  account.balance = nextBalance;
  markDirty();
  return ok(res, account);
});

app.get('/api/notifications', authRequired, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const mine = db.notifications.filter((entry) => entry.userId === req.user.id).slice(0, limit);
  const unreadCount = db.notifications.filter((entry) => entry.userId === req.user.id && !entry.read).length;
  return ok(res, mine, { unreadCount });
});

app.patch('/api/notifications/:id/read', authRequired, (req, res) => {
  const notification = db.notifications.find((entry) => entry.id === req.params.id && entry.userId === req.user.id);
  if (!notification) return fail(res, 404, 'Notification not found');

  notification.read = true;
  notification.updatedAt = nowIso();
  markDirty();
  return ok(res, notification);
});

app.patch('/api/notifications/read-all', authRequired, (_req, res) => {
  const timestamp = nowIso();
  for (const notification of db.notifications) {
    if (notification.userId === _req.user.id && !notification.read) {
      notification.read = true;
      notification.updatedAt = timestamp;
    }
  }
  markDirty();
  return ok(res, { success: true });
});

app.delete('/api/notifications/:id', authRequired, (req, res) => {
  const index = db.notifications.findIndex((entry) => entry.id === req.params.id && entry.userId === req.user.id);
  if (index === -1) return fail(res, 404, 'Notification not found');

  db.notifications.splice(index, 1);
  markDirty();
  return ok(res, { success: true });
});

app.use((req, res) => fail(res, 404, `Route not found: ${req.method} ${req.path}`));

const startServer = async () => {
  try {
    await loadFromMongo();
  } catch (error) {
    console.error('MongoDB not available. Running with in-memory state only.', error?.message || error);
  }

  app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`);
  });
};

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await flushToMongo();
    if (mongo.client) {
      await mongo.client.close();
    }
  } catch (error) {
    console.error('Shutdown error:', error);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

void startServer();
