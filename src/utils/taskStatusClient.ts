import type { TaskAssignmentDTO, TaskStatus } from '../models/types';

export function computeGlobalStatusFromAssignmentsClient(
  currentGlobal: TaskStatus,
  assignments: TaskAssignmentDTO[]
): TaskStatus {
  if (
    currentGlobal === 'ANNULÉE' ||
    currentGlobal === 'VALIDÉE' ||
    currentGlobal === 'REFUSÉE' ||
    currentGlobal === 'À VALIDER'
  ) {
    return currentGlobal;
  }
  if (assignments.length === 0) return 'NOUVELLE';

  const statuses = assignments.map((a) => a.statut_agent);
  if (statuses.every((s) => s === 'TERMINÉE')) return 'TERMINÉE';
  if (statuses.some((s) => s === 'BLOQUÉE')) return 'BLOQUÉE';
  if (statuses.some((s) => s === 'EN COURS') || statuses.some((s) => s === 'TERMINÉE')) {
    return 'EN COURS';
  }
  if (statuses.some((s) => s === 'EN ATTENTE')) return 'EN ATTENTE';
  if (statuses.some((s) => s === 'ACCEPTÉE')) return 'ACCEPTÉE';
  return 'TRANSMISE';
}
