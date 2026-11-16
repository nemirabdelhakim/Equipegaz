import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera, FileText, Loader2, X } from 'lucide-react';
import type { PhotoRecord, PhotoType, ReportDTO, TaskDTO } from '../models/types';
import { ApiError, apiClient, isNetworkError } from '../services/apiClient';
import {
  enqueueOfflinePhotoUpload,
  enqueueOfflineReportSubmit,
  listOfflinePhotosForTask,
} from '../services/offlineSyncService';
import { useAuth } from '../stores/AuthContext';
import { AuthPhoto } from './AuthPhoto';

interface ReportModalProps {
  open: boolean;
  task: TaskDTO | null;
  previousReport?: ReportDTO | null;
  onSubmitted: (report: ReportDTO) => Promise<void> | void;
  onClose: () => void;
}

async function compressImageToBase64(file: File): Promise<{
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => {
        const mime =
          file.type === 'image/png' || file.type === 'image/webp'
            ? file.type
            : 'image/jpeg';
        resolve({ mimeType: mime, base64: dataUrl });
      };
      img.onload = () => {
        const maxSide = 1600;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ mimeType: 'image/jpeg', base64: dataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ mimeType: 'image/jpeg', base64: compressed });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  task,
  previousReport,
  onSubmitted,
  onClose,
}) => {
  const { user, isOnline } = useAuth();
  const [travailEffectue, setTravailEffectue] = useState('');
  const [resultat, setResultat] = useState('Intervention réalisée avec succès');
  const [difficultes, setDifficultes] = useState('');
  const [materiel, setMateriel] = useState('');
  const [travauxRestants, setTravauxRestants] = useState('');
  const [recommandations, setRecommandations] = useState('');
  const [tempsPasseMinutes, setTempsPasseMinutes] = useState(45);

  const [taskPhotos, setTaskPhotos] = useState<PhotoRecord[]>([]);
  const [uploadingPhotoType, setUploadingPhotoType] = useState<PhotoType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open || !task) return;
    setErrorMsg('');
    if (previousReport) {
      setTravailEffectue(previousReport.travail_effectue);
      setResultat(previousReport.resultat);
      setDifficultes(previousReport.difficultes);
      setMateriel(previousReport.materiel);
      setTravauxRestants(previousReport.travaux_restants);
      setRecommandations(previousReport.recommandations);
      setTempsPasseMinutes(previousReport.temps_passe_minutes || 45);
    } else {
      setTravailEffectue('');
      setResultat('Intervention réalisée avec succès');
      setDifficultes('');
      setMateriel(task.materiel_necessaire || '');
      setTravauxRestants('');
      setRecommandations('');
      setTempsPasseMinutes(45);
    }

    Promise.all([
      isOnline ? apiClient.listTaskReports(task.task_id).catch(() => ({ photos: [] })) : Promise.resolve({ photos: [] }),
      listOfflinePhotosForTask(task.task_id),
    ]).then(([serverRes, localPhotos]) => {
      setTaskPhotos([...serverRes.photos, ...localPhotos]);
    });
  }, [open, task, previousReport, isOnline]);

  if (!open || !task) return null;

  const handlePhotoUpload = async (
    typePhoto: PhotoType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    setUploadingPhotoType(typePhoto);
    setErrorMsg('');

    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImageToBase64(file);
        const fileName = file.name || `photo_${typePhoto.toLowerCase()}.jpg`;

        if (!isOnline) {
          const queued = await enqueueOfflinePhotoUpload({
            user,
            task,
            type_photo: typePhoto,
            file_name: fileName,
            mime_type: compressed.mimeType,
            data_base64: compressed.base64,
          });
          setTaskPhotos((prev) => [...prev, queued.photo]);
          continue;
        }

        try {
          const res = await apiClient.uploadTaskPhoto(task.task_id, {
            type_photo: typePhoto,
            file_name: fileName,
            mime_type: compressed.mimeType,
            data_base64: compressed.base64,
          });
          setTaskPhotos((prev) => [...prev, res.photo]);
        } catch (err) {
          if (isNetworkError(err)) {
            const queued = await enqueueOfflinePhotoUpload({
              user,
              task,
              type_photo: typePhoto,
              file_name: fileName,
              mime_type: compressed.mimeType,
              data_base64: compressed.base64,
            });
            setTaskPhotos((prev) => [...prev, queued.photo]);
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Impossible de téléverser la photo.'
      );
    } finally {
      setUploadingPhotoType(null);
      e.target.value = '';
    }
  };

  const nextVersionNumber = previousReport ? previousReport.version + 1 : 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setErrorMsg('');
    const payload = {
      travail_effectue: travailEffectue.trim(),
      resultat: resultat.trim(),
      difficultes: difficultes.trim(),
      materiel: materiel.trim(),
      travaux_restants: travauxRestants.trim(),
      recommandations: recommandations.trim(),
      temps_passe_minutes: Number(tempsPasseMinutes) || 0,
      photo_ids: taskPhotos.map((p) => p.photo_id),
    };

    try {
      if (!isOnline) {
        const queued = await enqueueOfflineReportSubmit({
          user,
          task,
          nextVersion: nextVersionNumber,
          payload,
        });
        await onSubmitted(queued.optimisticReport);
        onClose();
        return;
      }

      try {
        const res = await apiClient.submitTaskReport(task.task_id, payload);
        await onSubmitted(res.report);
        onClose();
      } catch (err) {
        if (isNetworkError(err)) {
          const queued = await enqueueOfflineReportSubmit({
            user,
            task,
            nextVersion: nextVersionNumber,
            payload,
          });
          await onSubmitted(queued.optimisticReport);
          onClose();
          return;
        }
        throw err;
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Impossible de soumettre le compte-rendu.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#0055A4]" />
              <span className="font-mono text-xs font-bold text-[#0055A4] dark:text-blue-400">
                {task.numero_tache} · Version v{nextVersionNumber}
              </span>
            </div>
            <h3 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
              {previousReport
                ? `Corriger le compte-rendu (v${nextVersionNumber})`
                : "Compte-rendu détaillé d'intervention"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {task.titre} — {task.commune}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {previousReport && previousReport.commentaire_chef && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <p className="font-semibold">
              Motif du refus sur v{previousReport.version} par{' '}
              {previousReport.validateur_nom || 'le Chef'} :
            </p>
            <p className="mt-1">{previousReport.commentaire_chef}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Travail effectué en détail *
            </label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={travailEffectue}
              onChange={(e) => setTravailEffectue(e.target.value)}
              placeholder="Décrivez précisément les opérations techniques réalisées sur le réseau ou l'ouvrage..."
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Résultat constaté *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={resultat}
                onChange={(e) => setResultat(e.target.value)}
                placeholder="Ex. Fuite colmatée, pression aval conforme (300 mbar)"
                className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Durée (minutes)
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                value={tempsPasseMinutes}
                onChange={(e) => setTempsPasseMinutes(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Difficultés rencontrées
              </label>
              <textarea
                rows={2}
                value={difficultes}
                onChange={(e) => setDifficultes(e.target.value)}
                placeholder="Contraintes d'accès, état conduite, météo..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Matériel & Pièces utilisées
              </label>
              <textarea
                rows={2}
                value={materiel}
                onChange={(e) => setMateriel(e.target.value)}
                placeholder="Collier inox, vanne DN..., joint..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Travaux restants éventuels
              </label>
              <textarea
                rows={2}
                value={travauxRestants}
                onChange={(e) => setTravauxRestants(e.target.value)}
                placeholder="Réfection chaussée, peinture coffret..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Recommandations techniques
              </label>
              <textarea
                rows={2}
                value={recommandations}
                onChange={(e) => setRecommandations(e.target.value)}
                placeholder="Surveillance périodique, remplacement préventif..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Section Photos AVANT / APRÈS */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Photos terrain (AVANT / APRÈS)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Archivées automatiquement dans Google Drive (ou en attente locale si Drive est
                  déconnecté).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300">
                  {uploadingPhotoType === 'AVANT' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  <span>+ Photo AVANT</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={uploadingPhotoType !== null}
                    onChange={(e) => handlePhotoUpload('AVANT', e)}
                    className="sr-only"
                  />
                </label>

                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
                  {uploadingPhotoType === 'APRES' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  <span>+ Photo APRÈS</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={uploadingPhotoType !== null}
                    onChange={(e) => handlePhotoUpload('APRES', e)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {taskPhotos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {taskPhotos.map((photo) => (
                  <AuthPhoto key={photo.photo_id} photo={photo} />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingPhotoType !== null}
              className="min-h-[44px] rounded-lg bg-[#0055A4] px-5 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-50"
            >
              {submitting
                ? 'Transmission...'
                : `Soumettre le compte-rendu v${nextVersionNumber}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
