import { useEffect } from 'react';
import { useStore } from '@/store/useStore';


const NotificationsPage = () => {
  const { notifications, markAllNotificationsRead, fetchNotifications } = useStore();

  useEffect(() => {
    void fetchNotifications().then(() => {
      markAllNotificationsRead();
    });
    // eslint-disable-next-line
  }, []);

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-6">Notifications</h1>
      <div className="space-y-2">
        {notifications.length > 0 ? notifications.map(n => (
          <div key={n.id} className="p-4 rounded-[10px] bg-card">
            <p className="text-foreground">{n.message}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString('en-NG')}</p>
          </div>
        )) : (
          <p className="text-center py-8 text-muted-foreground">No notifications</p>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
