import React, { useMemo, useState } from 'react';
import { Bell, BellRing, Check, CheckCheck, ExternalLink, Smartphone } from 'lucide-react';
import type { AppSection, NotificationDTO } from '../models/types';
import { ApiError, apiClient } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateTimeFr, getOrCreateDeviceId } from '../utils/formatters';

interface NotificationsPageProps {
  notifications: NotificationDTO[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
  onNavigate: (section: AppSection) => void;
}

type NotifFilter = 'ALL' | 'UNREAD' | 'OVERDUE';

const EVENT_LABELS: Record<string, string> = {
  TACHE_AFFECTEE: 'Nouvelle affectation',
  TACHE_URGENTE: 'Intervention urgente',
  TACHE_MODIFIEE: 'Tâche modifiée',
  TACHE_EN_RETARD: 'Échéance dépassée',
  CR_A_VALIDER: 'Compte-rendu à valider',
  CR_VALIDE: 'Compte-rendu validé',
  CR_REFUSE: 'Compte-rendu refusé',
};

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  notifications,
  loading,
  onDataChanged,
  onNavigate,
}) => {
  const { user, isOnline } = useAuth();
  const [filter, setFilter] = useState<NotifFilter>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.date_lecture).length,
    [notifications]
  );

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'UNREAD') return !n.date_lecture;
      if (filter === 'OVERDUE') {
        return n.type_event === 'TACHE_EN_RETARD' || n.type_event === 'TACHE_URGENTE';
      }
      return true;
    });
  }, [notifications, filter]);

  const handleMarkRead = async (notificationId: string) => {
    setBusyId(notificationId);
    setErrorMsg('');
    try {
      await apiClient.markNotificationRead(notificationId);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Impossible de marquer la notification.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setBusyAll(true);
    setErrorMsg('');
    try {
      await apiClient.markAllNotificationsRead();
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Impossible de tout marquer comme lu.'
      );
    } finally {
      setBusyAll(false);
    }
  };

  const handleEnableDeviceNotifications = async () => {
    setErrorMsg('');
    setPushStatus('');
    try {
      let token = `web-push:${getOrCreateDeviceId()}`;
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'denied') {
          setErrorMsg(
            'Permission refusée dans le navigateur. Autorisez les notifications dans les paramètres du site.'
          );
          return;
        }
        token = `web-push:${perm}:${getOrCreateDeviceId()}`;
      }
      await apiClient.registerNotificationDevice(getOrCreateDeviceId(), 'WEB', token);
      setPushStatus(
        'Appareil enregistré auprès du serveur Sonelgaz pour la réception des alertes.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Impossible d'enregistrer cet appareil pour les notifications."
      );
    }
  };

  const handleOpenLinkedSection = (notif: NotificationDTO) => {
    if (
      notif.type_event === 'CR_A_VALIDER' ||
      notif.type_event === 'CR_VALIDE' ||
      notif.type_event === 'CR_REFUSE'
    ) {
      onNavigate('reports');
      return;
    }
    onNavigate(user?.role === 'CHEF' ? 'tasks' : 'missions');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Centre de notifications
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Alertes dédupliquées : nouvelles affectations, urgences, retards et validations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!isOnline}
            onClick={() => void handleEnableDeviceNotifications()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Smartphone className="h-4 w-4 text-[#0055A4]" />
            <span>Activer sur cet appareil</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              disabled={busyAll || !isOnline}
              onClick={() => void handleMarkAllRead()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0055A4] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004485] disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              <span>{busyAll ? 'Mise à jour...' : `Tout marquer comme lu (${unreadCount})`}</span>
            </button>
          )}
        </div>
      </div>

      {pushStatus && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          {pushStatus}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Filtres */}
      <div className="inline-flex rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
        {[
          { id: 'ALL' as const, label: `Toutes (${notifications.length})` },
          { id: 'UNREAD' as const, label: `Non lues (${unreadCount})` },
          { id: 'OVERDUE' as const, label: 'Urgences & Retards' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`min-h-[38px] rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              filter === item.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Liste des notifications */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading && notifications.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Chargement des notifications...</p>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <Bell className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            Aucune notification dans cette catégorie.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((notif) => {
              const unread = !notif.date_lecture;
              const eventLabel = EVENT_LABELS[notif.type_event] || notif.type_event;
              return (
                <div
                  key={notif.notification_id}
                  className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${
                    unread ? 'bg-blue-50/35 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        notif.type_event === 'TACHE_EN_RETARD' ||
                        notif.type_event === 'TACHE_URGENTE' ||
                        notif.type_event === 'CR_REFUSE'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                          : 'bg-blue-100 text-[#0055A4] dark:bg-blue-950/50 dark:text-blue-400'
                      }`}
                    >
                      {unread ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#0055A4] dark:text-blue-400">
                          {eventLabel}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTimeFr(notif.date_creation)}
                        </span>
                        {unread && (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            · Non lue
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {notif.titre}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                        {notif.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {notif.task_id && (
                      <button
                        type="button"
                        onClick={() => handleOpenLinkedSection(notif)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Ouvrir</span>
                      </button>
                    )}

                    {unread && (
                      <button
                        type="button"
                        disabled={busyId === notif.notification_id || !isOnline}
                        onClick={() => void handleMarkRead(notif.notification_id)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Marquer lu</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
