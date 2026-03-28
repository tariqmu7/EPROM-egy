import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { dataService } from '../services/store';
import { User, Notification } from '../types';

interface NotificationBellProps {
  user: User;
  onNavigate: (tab: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ user, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    const notifs = dataService.getNotifications(user.id);
    setNotifications(notifs);
  };

  useEffect(() => {
    fetchNotifications();
    // Simple polling for new notifications (could be replaced with WebSockets in a real app)
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [user.id]);

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
    }
    if (notification.actionLink) {
      onNavigate(notification.actionLink);
      setIsOpen(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'INFO': return <Info size={16} className="text-slate-700" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-slate-500" />;
      case 'SUCCESS': return <CheckCircle size={16} className="text-emerald-500" />;
      case 'ERROR': return <XCircle size={16} className="text-slate-500" />;
      default: return <Info size={16} className="text-slate-700" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-none transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-none bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-none  border border-slate-300 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-xs font-semibold text-slate-800 hover:text-slate-800 flex items-center gap-1"
              >
                <Check size={14} /> Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {notifications.map(notification => (
                  <div 
                    key={notification.id} 
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3 ${!notification.isRead ? 'bg-slate-50/30' : ''}`}
                  >
                    <div className="mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className={`text-sm ${!notification.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {notification.title}
                        </h4>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{notification.message}</p>
                    </div>
                    {!notification.isRead && !notification.id.startsWith('dyn-') && (
                      <button 
                        onClick={(e) => handleMarkAsRead(e, notification.id)}
                        className="w-2 h-2 rounded-none bg-blue-600 self-center"
                        title="Mark as read"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                <Bell size={32} className="text-slate-300 mb-3" />
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
