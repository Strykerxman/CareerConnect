import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getToken } from '../auth';
import { getUnreadCount, UNREAD_EVENT } from '../notificationsApi';

// Task 16.4 - Navigation link with the unread notification count.
// The count is refreshed on every page change, every minute, and whenever
// the Notifications page announces a new count.

const REFRESH_MS = 60000;

function NotificationsLink({ className }) {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const signedIn = Boolean(getToken());

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return undefined;
    }
    const controller = new AbortController();
    const load = () => getUnreadCount({ signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted && Number.isInteger(data?.unreadCount)) setCount(data.unreadCount);
      })
      .catch(() => {
        // The badge is a hint; a failed refresh keeps the last known count.
      });

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [pathname, signedIn]);

  useEffect(() => {
    const onChange = event => {
      if (Number.isInteger(event.detail)) setCount(event.detail);
    };
    window.addEventListener(UNREAD_EVENT, onChange);
    return () => window.removeEventListener(UNREAD_EVENT, onChange);
  }, []);

  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <NavLink to="/notifications" className={className} aria-label={label}>
      Notifications
      {count > 0 && (
        <span className="nav-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
      )}
    </NavLink>
  );
}

export default NotificationsLink;
