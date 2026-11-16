import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from './layouts/AppShell';
import type {
  AgentDTO,
  AppSection,
  DistrictParam,
  HistoryEntry,
  NotificationDTO,
  ReportDTO,
  TaskDTO,
} from './models/types';
import { AgentsPage } from './pages/AgentsPage';
import { DashboardStatsPage } from './pages/DashboardStatsPage';
import { ExportsPage } from './pages/ExportsPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { MissionsPage } from './pages/MissionsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { ParamsPage } from './pages/ParamsPage';
import { PlanningPage } from './pages/PlanningPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { StoragePage } from './pages/StoragePage';
import { SyncPage } from './pages/SyncPage';
import { TasksPage } from './pages/TasksPage';
import { apiClient, isNetworkError } from './services/apiClient';
import {
  cacheWorkspaceSnapshot,
  flushOfflineQueue,
  listQueueOperations,
  loadCachedWorkspaceSnapshot,
  subscribeOfflineSync,
} from './services/offlineSyncService';
import { AuthProvider, useAuth } from './stores/AuthContext';

const AuthenticatedWorkspace: React.FC = () => {
  const { user, loading: authLoading, isOnline } = useAuth();
  const [activeSection, setActiveSection] = useState<AppSection>('overview');
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [params, setParams] = useState<DistrictParam[]>([]);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [conflictSyncCount, setConflictSyncCount] = useState(0);
  const isPullingRef = useRef(false);

  const hydrateFromLocalCache = useCallback(async (userId: string) => {
    const [cached, queue] = await Promise.all([
      loadCachedWorkspaceSnapshot(userId),
      listQueueOperations(userId),
    ]);
    if (cached) {
      setAgents(cached.agents);
      setTasks(cached.tasks);
      setReports(cached.reports);
      setHistory(cached.history);
      setParams(cached.parameters);
      if (cached.notifications) {
        setNotifications(cached.notifications);
      }
    }
    setPendingSyncCount(
      queue.filter((q) => q.statut === 'EN ATTENTE' || q.statut === 'EN COURS').length
    );
    setConflictSyncCount(
      queue.filter((q) => q.statut === 'CONFLIT' || q.statut === 'ERREUR').length
    );
  }, []);

  const loadWorkspaceData = useCallback(
    async (silent = false) => {
      if (!user || isPullingRef.current) return;
      isPullingRef.current = true;
      if (!silent) {
        setDataLoading(true);
      }

      try {
        await hydrateFromLocalCache(user.agent_id);

        if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          return;
        }

        const pullRes = await apiClient.syncPull();
        setAgents(pullRes.snapshot.agents);
        setTasks(pullRes.snapshot.tasks);
        setReports(pullRes.snapshot.reports);
        setHistory(pullRes.snapshot.history);
        setParams(pullRes.snapshot.parameters);
        setNotifications(pullRes.snapshot.notifications || []);

        await cacheWorkspaceSnapshot(user.agent_id, {
          agents: pullRes.snapshot.agents,
          tasks: pullRes.snapshot.tasks,
          reports: pullRes.snapshot.reports,
          history: pullRes.snapshot.history,
          parameters: pullRes.snapshot.parameters,
          notifications: pullRes.snapshot.notifications || [],
          serverTimeIso: pullRes.server_time_iso,
        });
      } catch (err) {
        if (isNetworkError(err)) {
          await hydrateFromLocalCache(user.agent_id);
        }
        // Erreur 401/403 gérée par apiClient -> redirection LoginPage si compte désactivé
      } finally {
        isPullingRef.current = false;
        if (!silent) {
          setDataLoading(false);
        }
      }
    },
    [user, isOnline, hydrateFromLocalCache]
  );

  // Chargement initial & réinitialisation lors de la déconnexion
  useEffect(() => {
    if (user) {
      void loadWorkspaceData(false);
    } else {
      setAgents([]);
      setTasks([]);
      setReports([]);
      setHistory([]);
      setParams([]);
      setNotifications([]);
      setPendingSyncCount(0);
      setConflictSyncCount(0);
      setActiveSection('overview');
    }
  }, [user, loadWorkspaceData]);

  // Abonnement aux mises à jour de la file locale IndexedDB
  useEffect(() => {
    if (!user) return;
    return subscribeOfflineSync(() => {
      void hydrateFromLocalCache(user.agent_id);
    });
  }, [user, hydrateFromLocalCache]);

  // Reprise automatique de la file hors connexion au retour d'Internet
  useEffect(() => {
    if (!user || !isOnline) return;
    let cancelled = false;
    void (async () => {
      const res = await flushOfflineQueue(user.agent_id);
      if (!cancelled && (res.synced > 0 || res.conflicts > 0 || res.errors > 0)) {
        await loadWorkspaceData(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isOnline, loadWorkspaceData]);

  // Synchronisation temps réel en arrière-plan (toutes les 20 secondes si en ligne)
  useEffect(() => {
    if (!user || !isOnline) return;
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void (async () => {
        await flushOfflineQueue(user.agent_id);
        await loadWorkspaceData(true);
      })();
    }, 20000);
    return () => window.clearInterval(intervalId);
  }, [user, isOnline, loadWorkspaceData]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Initialisation sécurisée de l&apos;application...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleDataChanged = async () => {
    await loadWorkspaceData(false);
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.date_lecture).length;

  return (
    <AppShell
      activeSection={activeSection}
      onNavigate={setActiveSection}
      onRefresh={() => void loadWorkspaceData(false)}
      refreshing={dataLoading}
      pendingSyncCount={pendingSyncCount}
      conflictSyncCount={conflictSyncCount}
      unreadNotificationsCount={unreadNotificationsCount}
    >
      {activeSection === 'overview' && (
        <OverviewPage
          agents={agents}
          tasks={tasks}
          reports={reports}
          history={history}
          params={params}
          loading={dataLoading}
          onNavigate={setActiveSection}
        />
      )}
      {activeSection === 'missions' && (
        <MissionsPage
          tasks={tasks}
          reports={reports}
          params={params}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
          onOpenAllTasks={() => setActiveSection('tasks')}
        />
      )}
      {activeSection === 'reports' && (
        <ReportsPage
          reports={reports}
          tasks={tasks}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
        />
      )}
      {activeSection === 'stats' && (
        <DashboardStatsPage
          tasks={tasks}
          reports={reports}
          agents={agents}
          params={params}
          onNavigate={setActiveSection}
        />
      )}
      {activeSection === 'notifications' && (
        <NotificationsPage
          notifications={notifications}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
          onNavigate={setActiveSection}
        />
      )}
      {activeSection === 'exports' && (
        <ExportsPage agents={agents} tasks={tasks} params={params} />
      )}
      {activeSection === 'planning' && (
        <PlanningPage
          tasks={tasks}
          agents={agents}
          params={params}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
        />
      )}
      {activeSection === 'tasks' && (
        <TasksPage
          tasks={tasks}
          reports={reports}
          agents={agents}
          params={params}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
        />
      )}
      {activeSection === 'sync' && <SyncPage onWorkspaceRefresh={handleDataChanged} />}
      {activeSection === 'agents' && (
        <AgentsPage
          agents={agents}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
        />
      )}
      {activeSection === 'history' && (
        <HistoryPage history={history} loading={dataLoading} />
      )}
      {activeSection === 'params' && (
        <ParamsPage
          params={params}
          agents={agents}
          loading={dataLoading}
          onDataChanged={handleDataChanged}
        />
      )}
      {activeSection === 'storage' && user.role === 'CHEF' && (
        <StoragePage onDataRestored={handleDataChanged} />
      )}
      {activeSection === 'profile' && <ProfilePage />}
    </AppShell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedWorkspace />
    </AuthProvider>
  );
}
