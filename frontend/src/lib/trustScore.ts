import type { BillPayment, Escrow, SavingsGroup, Transaction, TrustScore, User } from '@/types';

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const computeUserTrustScore = (payload: {
  currentUser: User | null;
  transactions: Transaction[];
  savingsGroups: SavingsGroup[];
  escrows: Escrow[];
  billPayments: BillPayment[];
  fallback: TrustScore;
}): TrustScore => {
  const { currentUser, transactions, savingsGroups, escrows, fallback } = payload;
  if (!currentUser) return fallback;

  const myTransactions = transactions.filter((tx) => (
    tx.senderAccount === currentUser.accountNumber || tx.receiverAccount === currentUser.accountNumber
  ));

  const myEscrows = escrows.filter((entry) => (
    entry.buyerWalletId === currentUser.walletId || entry.sellerWalletId === currentUser.walletId
  ));

  const mySavingsContributions = savingsGroups
    .flatMap((group) => group.members)
    .filter((member) => member.ajoUsername === (currentUser.ajoUsername || currentUser.username))
    .flatMap((member) => member.contributions);

  const myBillTransactions = myTransactions.filter((tx) => (
    tx.type === 'bills' || tx.type === 'airtime' || tx.type === 'data' || tx.type === 'insurance'
  ));

  const hasActivity =
    myTransactions.length > 0 ||
    myEscrows.length > 0 ||
    mySavingsContributions.length > 0 ||
    myBillTransactions.length > 0;

  if (!hasActivity) return fallback;

  const successfulTransactions = myTransactions.filter((tx) => tx.status === 'success').length;
  const transactionVolume = clampPercent((successfulTransactions / 25) * 100);

  const paidContributions = mySavingsContributions.filter((contribution) => contribution.status === 'paid').length;
  const savingsDiscipline = mySavingsContributions.length > 0
    ? clampPercent((paidContributions / mySavingsContributions.length) * 100)
    : 0;

  const reliableEscrows = myEscrows.filter((entry) => entry.status === 'released').length;
  const escrowReliability = myEscrows.length > 0
    ? clampPercent((reliableEscrows / myEscrows.length) * 100)
    : 0;

  const successfulBills = myBillTransactions.filter((tx) => tx.status === 'success').length;
  const billPaymentConsistency = myBillTransactions.length > 0
    ? clampPercent((successfulBills / myBillTransactions.length) * 100)
    : 0;

  const weightedAverage = (
    (transactionVolume * 0.35) +
    (savingsDiscipline * 0.25) +
    (escrowReliability * 0.2) +
    (billPaymentConsistency * 0.2)
  );

  return {
    overall: Math.round((weightedAverage / 100) * 850),
    transactionVolume,
    savingsDiscipline,
    escrowReliability,
    billPaymentConsistency,
  };
};
