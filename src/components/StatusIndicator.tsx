import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  Ban,
  CalendarOff,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  Minus,
  PauseCircle,
  PlayCircle,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { AgentStatus, TaskPriority, TaskStatus } from '../models/types';

export const AgentStatusLabel: React.FC<{ statut: AgentStatus }> = ({ statut }) => {
  switch (statut) {
    case 'ACTIF':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Actif</span>
        </span>
      );
    case 'INACTIF':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
          <PauseCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Inactif</span>
        </span>
      );
    case 'ABSENT':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Absent</span>
        </span>
      );
    case 'CONGÉ':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <CalendarOff className="h-3.5 w-3.5 shrink-0" />
          <span>Congé</span>
        </span>
      );
    case 'SUSPENDU':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span>Suspendu</span>
        </span>
      );
  }
};

export const PriorityLabel: React.FC<{ priorite: TaskPriority }> = ({ priorite }) => {
  switch (priorite) {
    case 'URGENTE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>Urgente</span>
        </span>
      );
    case 'HAUTE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Haute</span>
        </span>
      );
    case 'NORMALE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0055A4] dark:text-blue-400 whitespace-nowrap">
          <Minus className="h-3.5 w-3.5 shrink-0" />
          <span>Normale</span>
        </span>
      );
    case 'BASSE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          <span>Basse</span>
        </span>
      );
  }
};

export const TaskStatusLabel: React.FC<{ statut: TaskStatus }> = ({ statut }) => {
  switch (statut) {
    case 'NOUVELLE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>Nouvelle</span>
        </span>
      );
    case 'TRANSMISE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0055A4] dark:text-blue-400 whitespace-nowrap">
          <Send className="h-3.5 w-3.5 shrink-0" />
          <span>Transmise</span>
        </span>
      );
    case 'ACCEPTÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0055A4] dark:text-blue-300 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Acceptée</span>
        </span>
      );
    case 'EN COURS':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
          <PlayCircle className="h-3.5 w-3.5 shrink-0" />
          <span>En cours</span>
        </span>
      );
    case 'EN ATTENTE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <PauseCircle className="h-3.5 w-3.5 shrink-0" />
          <span>En attente</span>
        </span>
      );
    case 'BLOQUÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
          <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
          <span>Bloquée</span>
        </span>
      );
    case 'TERMINÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Terminée</span>
        </span>
      );
    case 'À VALIDER':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>À valider</span>
        </span>
      );
    case 'VALIDÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
          <span>Validée</span>
        </span>
      );
    case 'REFUSÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Refusée</span>
        </span>
      );
    case 'ANNULÉE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <Ban className="h-3.5 w-3.5 shrink-0" />
          <span>Annulée</span>
        </span>
      );
  }
};
