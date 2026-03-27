const base = 'http://localhost:5002';
const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');

const parse = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.message || 'request failed'}`);
  return body;
};

const req = (method, url, body, token) => fetch(base + url, {
  method,
  headers: {
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

const get = (url, token) => req('GET', url, undefined, token);
const post = (url, body, token) => req('POST', url, body, token);
const patch = (url, body, token) => req('PATCH', url, body, token);
const put = (url, body, token) => req('PUT', url, body, token);

const run = async () => {
  const u1 = {
    firstName: 'Flow',
    lastName: 'One',
    phone: `701${rand}111`,
    email: `flow1_${rand}@test.com`,
    username: `flow1_${rand}`,
    password: 'Pass123!',
    pin: '1234',
    age: '24',
  };

  const u2 = {
    firstName: 'Flow',
    lastName: 'Two',
    phone: `702${rand}222`,
    email: `flow2_${rand}@test.com`,
    username: `flow2_${rand}`,
    password: 'Pass123!',
    pin: '1234',
    age: '25',
  };

  const r1 = await parse(await post('/api/users/register', u1));
  const r2 = await parse(await post('/api/users/register', u2));
  const t1 = r1.token;
  const t2 = r2.token;
  const user1 = r1.data;
  const user2 = r2.data;

  await parse(await patch('/api/users/me/preferences', {
    escrowActivated: true,
    escrowWalletId: `ESC-${rand}A1`,
  }, t1));

  await parse(await patch('/api/users/me/preferences', {
    escrowActivated: true,
    escrowWalletId: `ESC-${rand}B2`,
  }, t2));

  const requestCreated = await parse(await post('/api/requests', {
    type: 'money',
    amount: 1500,
    requestedFromAccount: user2.accountNumber,
    note: 'flow check',
  }, t1));

  const requestId = requestCreated.data.id;
  const requestListForUser2 = await parse(await get('/api/requests', t2));
  if (!requestListForUser2.data.some((x) => x.id === requestId)) {
    throw new Error('Request not visible to recipient');
  }

  await parse(await patch(`/api/requests/${requestId}/respond`, {
    action: 'approve',
    amount: 1500,
  }, t2));

  const escrowCreated = await parse(await post('/api/escrows', {
    sellerWalletId: `ESC-${rand}B2`,
    amount: 2000,
    description: 'flow escrow',
    deliveryDeadline: new Date(Date.now() + 86400000).toISOString(),
  }, t1));

  const escrowId = escrowCreated.data.escrow.id;
  await parse(await patch(`/api/escrows/${escrowId}`, { action: 'accept' }, t2));
  await parse(await patch(`/api/escrows/${escrowId}`, { action: 'release' }, t1));

  const paycodeCreated = await parse(await post('/api/paycodes', { amount: 1000 }, t1));
  const paycodeId = paycodeCreated.data.paycode.id;
  const paycodesUser2 = await parse(await get('/api/paycodes', t2));
  if (paycodesUser2.data.some((x) => x.id === paycodeId)) {
    throw new Error('Paycode leaked across users');
  }
  await parse(await patch(`/api/paycodes/${paycodeId}/cancel`, {}, t1));

  const acc = await parse(await get('/api/users/me/account-state', t1));
  await parse(await post('/api/transactions/commit', {
    expectedBalance: acc.data.balance,
    nextBalance: acc.data.balance - 500,
    transaction: {
      idempotencyKey: `cross-${Date.now()}-${rand}`,
      type: 'cross-border',
      amount: 500,
      senderAccount: user1.accountNumber,
      receiverAccount: '1234567890',
      senderName: `${user1.firstName} ${user1.lastName}`,
      receiverName: 'Recipient',
      description: 'cross border test',
      status: 'success',
    },
  }, t1));

  const stateBefore = await parse(await get('/api/users/me/state', t1));
  const lockedFund = {
    id: `lf-${rand}`,
    name: 'Piggy Test',
    amount: 300,
    unlockDate: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    status: 'locked',
  };

  await parse(await put('/api/users/me/state', {
    ...stateBefore.data,
    lockedFunds: [lockedFund, ...(stateBefore.data.lockedFunds || [])],
  }, t1));

  const group = {
    id: `ajo-${rand}`,
    name: 'Ajo Test',
    creatorUsername: user1.username,
    contributionAmount: 100,
    totalMembers: 2,
    frequency: 'weekly',
    frequencyDay: 'monday',
    members: [],
    payoutOrder: [],
    createdAt: new Date().toISOString(),
  };

  await parse(await put(`/api/users/ajo/groups/${group.id}/sync`, { group }, t1));
  const stateAfter = await parse(await get('/api/users/me/state', t1));
  if (!(stateAfter.data.lockedFunds || []).some((x) => x.id === lockedFund.id)) {
    throw new Error('Piggy state not persisted');
  }
  if (!(stateAfter.data.savingsGroups || []).some((x) => x.id === group.id)) {
    throw new Error('Ajo state not persisted');
  }

  console.log('PASS');
  console.log(JSON.stringify({
    user1: user1.username,
    user2: user2.username,
    requestId,
    escrowId,
    paycodeId,
    ajoGroupId: group.id,
    lockedFundId: lockedFund.id,
  }, null, 2));
};

run().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
