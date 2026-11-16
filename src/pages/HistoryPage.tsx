import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { HistoryEntry } from '../models/types';
import { useAuth } from '../stores/AuthContext';
import { formatDateTimeFr } from '../utils/formatters';

interface HistoryPageProps {
  history: HistoryEntry[];
  loading: boolean;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ history, loading }) => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (h) =>
        h.action.toLowerCase().includes(q) ||
        h.user_name.toLowerCase().includes(q) ||
        h.commentaire.toLowerCase().includes(q)
    );
  }, [history, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Journal d&apos;audit & historique
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {user?.role === 'CHEF'
            ? "Traçabilité horodatée (Africa/Algiers) de toutes les opérations d'administration et connexions."
            : 'Historique personnel de vos connexions et opérations sur le système.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par action, agent ou commentaire..."
            className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 focus:border-[#0055A4] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune entrée dans le journal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">Date & Heure (Alger)</th>
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Détails / Commentaire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((item) => (
                  <tr
                    key={item.history_id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTimeFr(item.date_serveur)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-900 dark:text-white whitespace-nowrap">
                      {item.user_name}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#0055A4] dark:text-blue-400 whitespace-nowrap">
                      {item.action.replaceAll('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {item.commentaire}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
