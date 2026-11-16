import React, { useEffect, useState } from 'react';
import { Cloud, ExternalLink, HardDrive, ImageOff } from 'lucide-react';
import type { PhotoRecord } from '../models/types';
import { apiClient } from '../services/apiClient';
import { getOfflinePhotoById } from '../services/offlineSyncService';
import { formatDateTimeFr } from '../utils/formatters';

interface AuthPhotoProps {
  photo: PhotoRecord;
}

export const AuthPhoto: React.FC<AuthPhotoProps> = ({ photo }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (photo.photo_id.startsWith('local-')) {
      getOfflinePhotoById(photo.photo_id)
        .then((offlinePhoto) => {
          if (!active) return;
          if (offlinePhoto?.data_base64) {
            setBlobUrl(offlinePhoto.data_base64);
          } else {
            setFailed(true);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }

    apiClient
      .fetchProtectedPhotoBlobUrl(photo.photo_id)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [photo.photo_id]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800">
        {blobUrl ? (
          <img
            src={blobUrl}
            alt={`Photo ${photo.type_photo} — ${photo.file_name}`}
            className="h-full w-full object-cover"
          />
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-slate-400">
            <ImageOff className="h-5 w-5" />
            <span>Aperçu local indisponible</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Chargement...
          </div>
        )}
      </div>

      <div className="space-y-1 p-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-mono text-[11px] font-bold ${
              photo.type_photo === 'AVANT'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {photo.type_photo}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            {photo.synced_to_drive ? (
              <>
                <Cloud className="h-3 w-3 text-[#0055A4]" />
                <span>Drive</span>
              </>
            ) : (
              <>
                <HardDrive className="h-3 w-3 text-amber-600" />
                <span>Local</span>
              </>
            )}
          </span>
        </div>

        <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {formatDateTimeFr(photo.date_creation)}
        </p>

        {photo.synced_to_drive && photo.drive_url.startsWith('http') && (
          <a
            href={photo.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0055A4] hover:underline dark:text-blue-400"
          >
            <span>Ouvrir sur Drive</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
};
