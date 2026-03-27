interface StatusBadgeProps {
  status: 'success' | 'pending' | 'failed' | 'paid' | 'unpaid' | 'active' | 'completed' | 'disputed' | 'cancelled' | 'released';
}

const statusStyles: Record<string, string> = {
  success: 'text-[#0C436A]',
  paid: 'bg-success/10 text-success',
  released: 'bg-success/10 text-success',
  active: 'bg-info/10 text-info',
  completed: 'bg-success/10 text-success',
  pending: 'text-[#208F9A]',
  unpaid: 'bg-warning/10 text-warning',
  failed: 'text-red-500',
  disputed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusStyles[status] || 'text-muted-foreground'}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
