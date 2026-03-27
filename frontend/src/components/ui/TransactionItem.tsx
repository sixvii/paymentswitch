import { ArrowUpRight, ArrowDownLeft, Phone, Tv, Zap, Shield, Users, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';
import StatusBadge from './StatusBadge';

const typeIcons: Record<string, React.ElementType> = {
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  airtime: Phone,
  data: Phone,
  bills: Zap,
  insurance: Shield,
  escrow: Wallet,
  ajo: Users,
};

const typeLabels: Record<string, string> = {
  send: 'Transfer',
  receive: 'Received',
  airtime: 'Airtime',
  data: 'Data',
  bills: 'Bills',
  insurance: 'Insurance',
  escrow: 'Escrow',
  ajo: 'Ajo',
};

interface TransactionItemProps {
  transaction: Transaction;
  onClick?: () => void;
}

const TransactionItem = ({ transaction, onClick }: TransactionItemProps) => {
  const Icon = typeIcons[transaction.type] || Wallet;
  const isDebit = ['send', 'airtime', 'data', 'bills', 'insurance', 'escrow', 'ajo'].includes(transaction.type);
  const date = new Date(transaction.timestamp);

  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-muted/50 transition-colors text-left">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDebit ? 'bg-destructive/10' : 'bg-success/10'}`}>
        <Icon className={`w-5 h-5 ${isDebit ? 'text-destructive' : 'text-success'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">
          {typeLabels[transaction.type]} {transaction.type === 'send' ? `to ${transaction.receiverName}` : transaction.type === 'receive' ? `from ${transaction.senderName}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} | {date.toLocaleDateString('en-NG')}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-bold ${isDebit ? 'text-foreground' : 'text-success'}`}>
          {isDebit ? '-' : '+'}₦{transaction.amount.toLocaleString()}
        </p>
        <StatusBadge status={transaction.status} />
      </div>
    </button>
  );
};

export default TransactionItem;
