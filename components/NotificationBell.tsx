import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, Info, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { dataService } from '../services/store';
import { User, Notification } from '../types';

interface NotificationBellProps {
  user: User;
  onNavigate: (tab: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ user, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(() => {
    const notifs = dataService.getNotifications(user.id);
    setNotifications(notifs);
  }, [user.id]);

  useEffect(() => {
    fetchNotifications();

    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchNotifications, 30000);
    };
    const stopPolling = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    startPolling();

    const handleVisibility = () => {
      if (document.hidden) { stopPolling(); } else { fetchNotifications(); startPolling(); }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await dataService.markNotificationAsRead(id);
    fetchNotifications();
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await dataService.markAllNotificationsAsRead(user.id);
    fetchNotifications();
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await dataService.markNotificationAsRead(notification.id);
      fetchNotifications();
    }
    if (notification.actionLink) {
      onNavigate(notification.actionLink);
      setIsOpen(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'INFO': return <Info size={16} className="text-blue-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-amber-500" />;
      case 'SUCCESS': return <CheckCircle size={16} className="text-emerald-500" />;
      case 'ERROR': return <XCircle size={16} className="text-rose-500" />;
      default: return <Info size={16} className="text-slate-500" />;
    }
  };

  const unread = notifications.filter(n => !n.isRead);
  const read   = notifications.filter(n =>  n.isRead);
  const grouped = [...unread, ...read];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-none transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-none bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-300 overflow-hidden z-50 shadow-xl animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 border border-rose-200">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors"
              >
                <Check size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {grouped.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {unreadCount > 0 && (
                  <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70">Unread</p>
                )}
                {grouped.map((notification, idx) => {
                  const isFirstRead = notification.isRead && idx === unreadCount && unreadCount > 0;
                  return (
                    <React.Fragment key={notification.id}>
                      {isFirstRead && (
                        <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70">Earlier</p>
                      )}
                      <div
                        onClick={() => handleNotificationClick(notification)}
                        className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${
                          !notification.isRead ? 'bg-blue-50/30 border-l-2 border-l-blue-400' : ''
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{getIcon(notification.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2 mb-0.5">
                            <h4 className={`text-sm leading-snug ${!notification.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                              {notification.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                              {timeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{notification.message}</p>
                          {notification.actionLink && (
                            <span className="text-[10px] font-bold text-blue-600 mt-1 inline-block">View →</span>
                          )}
                        </div>
                        {!notification.isRead && !notification.id.startsWith('dyn-') && (
                          <button
                            onClick={(e) => handleMarkAsRead(e, notification.id)}
                            className="w-2 h-2 rounded-full bg-blue-500 self-center shrink-0 hover:bg-blue-700 transition-colors"
                            title="Mark as read"
                          />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400 flex flex-col items-center">
                <Bell size={32} className="text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-500">All caught up!</p>
                <p className="text-xs mt-1">No notifications right now.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
