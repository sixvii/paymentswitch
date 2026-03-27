import { useNavigate } from 'react-router-dom';

interface TransactionSuccessActionProps {
  transactionId?: string;
  className?: string;
  fallbackPath?: string;
  fallbackLabel?: string;
  receiptLabel?: string;
}

const TransactionSuccessAction = ({
  transactionId,
  className,
  fallbackPath = '/',
  fallbackLabel = 'Done',
  receiptLabel = 'View Receipt',
}: TransactionSuccessActionProps) => {
  const navigate = useNavigate();

  const label = transactionId ? receiptLabel : fallbackLabel;

  return (
    <button
      type="button"
      className={className}
      onClick={() => navigate(transactionId ? `/transact/receipt/${transactionId}` : fallbackPath)}
    >
      {label}
    </button>
  );
};

export default TransactionSuccessAction;
