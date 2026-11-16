import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CloudUpload,
  Database,
  Download,
  FileCheck2,
  Flame,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  UserCircle,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import type { AppSection } from '../models/types';
import { useAuth } from '../stores/AuthContext';
import { getInitials } from '../utils/formatters';

interface NavItem {
  id: AppSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chefOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Accueil', icon: LayoutDashboard },
  { id: 'missions', label: 'Mes missions', icon: Wrench },
  { id: 'planning', label: 'Planning', icon: CalendarDays },
  { id: 'tasks', label: 'Tâches', icon: ClipboardList },
  { id: 'reports', label: 'Comptes-rendus', icon: FileCheck2 },
  { id: 'stats', label: 'Statistiques', icon: BarChart3 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'exports', label: 'Exports PDF/XLSX', icon: Download },
  { id: 'sync', label: 'Synchronisation', icon: CloudUpload },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'params', label: 'Référentiels', icon: MapPin },
  { id: 'storage', label: 'Base Sheets', icon: Database, chefOnly: true },
  { id: 'profile', label: 'Mon profil', icon: UserCircle },
];

interface AppShellProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  pendingSyncCount?: number;
  conflictSyncCount?: number;
  unreadNotificationsCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onNavigate,
  onRefresh,
  refreshing = false,
  pendingSyncCount = 0,
  conflictSyncCount = 0,
  unreadNotificationsCount = 0,
  children,
}) => {
  const { user, isOnline, theme, toggleTheme, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);

  if (!user) return null;

  const currentNav = NAV_ITEMS.filter((item) => !item.chefOnly || user.role === 'CHEF');
  const activeLabel = currentNav.find((i) => i.id === activeSection)?.label || 'Accueil';

  const handleNavClick = (section: AppSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden print:hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white dark:lg:border-slate-800 dark:lg:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0055A4] text-white">
            <Flame className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold text-slate-900 dark:text-white">
              ÉQUIPE GAZ SIDI ALI
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Sonelgaz Mostaganem
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Navigation principale">
          {currentNav.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0055A4] text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'notifications' && unreadNotificationsCount > 0 && (
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      active ? 'text-white' : 'text-[#0055A4] dark:text-blue-400'
                    }`}
                  >
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {getInitials(user.prenom, user.nom)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {user.prenom} {user.nom}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user.role === 'CHEF' ? "Chef d'équipe" : 'Agent terrain'} ·{' '}
                <span className="font-mono">{user.matricule}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmLogoutOpen(true)}
            className="mt-3 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                DISTRICT GAZ SIDI ALI
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {currentNav.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`flex min-h-[46px] w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium ${
                      active
                        ? 'bg-[#0055A4] text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setConfirmLogoutOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-4 w-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zone principale */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 print:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden text-slate-400 sm:inline whitespace-nowrap">
                District Sidi Ali
              </span>
              <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 dark:text-white">
                {activeLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                unreadNotificationsCount > 0
                  ? 'border-blue-200 bg-blue-50 text-[#0055A4] dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
              title="Centre de notifications"
              aria-label={`Notifications (${unreadNotificationsCount} non lues)`}
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{unreadNotificationsCount}</span>
            </button>

            {(pendingSyncCount > 0 || conflictSyncCount > 0) && (
              <button
                type="button"
                onClick={() => handleNavClick('sync')}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  conflictSyncCount > 0
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
                title="Voir la file de synchronisation"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span className="font-mono tabular-nums">
                  {conflictSyncCount > 0
                    ? `${conflictSyncCount} conflit(s)`
                    : `${pendingSyncCount} en attente`}
                </span>
              </button>
            )}

            <div
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                isOnline
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400'
              }`}
            >
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {isOnline ? 'En ligne' : 'Hors connexion'}
              </span>
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing || !isOnline}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Actualiser les données"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {!isOnline && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 print:hidden dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            Mode hors connexion actif — Les dernières données synchronisées sont affichées. Vos
            actions et comptes-rendus sont conservés localement et seront transmis dès le retour
            d&apos;Internet.
          </div>
        )}

        <main className="flex-1 p-4 pb-24 sm:p-6 lg:pb-8 print:p-0">{children}</main>

        {/* Barre inférieure mobile tactile */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-1.5 print:hidden lg:hidden dark:border-slate-800 dark:bg-slate-900"
          aria-label="Navigation mobile"
        >
          {currentNav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium ${
                  active
                    ? 'text-[#0055A4] dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <ConfirmModal
        open={confirmLogoutOpen}
        title="Confirmer la déconnexion"
        description="Voulez-vous fermer votre session de travail sur cet appareil ?"
        confirmLabel="Se déconnecter"
        tone="warning"
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          logout();
        }}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </div>
  );
};
