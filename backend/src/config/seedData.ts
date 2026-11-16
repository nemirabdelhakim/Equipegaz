import { v4 as uuidv4 } from 'uuid';
import type { AgentRecord, DistrictParamRecord } from '../models/domain.js';
import { nowIso } from '../utils/dateAlgiers.js';

export const DEFAULT_CHIEF_EMAIL = (
  process.env.INITIAL_CHIEF_EMAIL || 'nemirabdelhakim@gmail.com'
).toLowerCase();

export const INITIAL_COMMUNES: Array<{ code: string; label: string }> = [
  { code: 'COM-01', label: 'Sidi Ali' },
  { code: 'COM-02', label: 'Hadjadj' },
  { code: 'COM-03', label: 'Ben Abdelmalek Ramdane' },
  { code: 'COM-04', label: 'Sidi Lakhdar' },
  { code: 'COM-05', label: 'Ouled Maallah' },
  { code: 'COM-06', label: 'Ouled Bouziane' },
  { code: 'COM-07', label: 'Tazgait' },
  { code: 'COM-08', label: 'Achaacha' },
  { code: 'COM-09', label: 'Nekmaria' },
  { code: 'COM-10', label: 'Khadra' },
];

export const INITIAL_DPS: Array<{ code: string; label: string; communeRef: string }> = [
  { code: 'DP-SA-01', label: 'DP Sidi Ali Centre', communeRef: 'COM-01' },
  { code: 'DP-SA-02', label: 'DP Hadjadj', communeRef: 'COM-02' },
  { code: 'DP-SA-03', label: 'DP Ben Abdelmalek Ramdane', communeRef: 'COM-03' },
  { code: 'DP-SA-04', label: 'DP Sidi Lakhdar', communeRef: 'COM-04' },
  { code: 'DP-SA-05', label: 'DP Ouled Maallah', communeRef: 'COM-05' },
  { code: 'DP-SA-06', label: 'DP Ouled Bouziane', communeRef: 'COM-06' },
  { code: 'DP-SA-07', label: 'DP Tazgait', communeRef: 'COM-07' },
  { code: 'DP-SA-08', label: 'DP Achaacha', communeRef: 'COM-08' },
  { code: 'DP-SA-09', label: 'DP Nekmaria', communeRef: 'COM-09' },
  { code: 'DP-SA-10', label: 'DP Khadra', communeRef: 'COM-10' },
];

export const INITIAL_TASK_CATEGORIES: Array<{ code: string; label: string }> = [
  { code: 'FUG', label: 'Recherche et réparation de fuite gaz' },
  { code: 'ING', label: 'Intervention sur incident gaz' },
  { code: 'VAN', label: 'Entretien de vanne' },
  { code: 'CM', label: 'Entretien de compteur de manœuvre' },
  { code: 'VCH', label: 'Visite de chantier' },
  { code: 'ETU', label: 'Étude technique' },
  { code: 'ST', label: 'Sortie technique' },
  { code: 'DEET', label: 'Assistance DEET' },
  { code: 'COM', label: 'Assistance commerciale' },
  { code: 'ENT', label: 'Assistance entreprise' },
  { code: 'CPT', label: 'Intervention compteur' },
  { code: 'OUV', label: "Contrôle d'ouvrage" },
  { code: 'RSF', label: 'Travaux RSF' },
  { code: 'PUR', label: 'Purge de réseau' },
  { code: 'CPM', label: 'Contrôle après mise en service' },
  { code: 'AUT', label: 'Autres travaux' },
];

export function buildSeedParameters(): DistrictParamRecord[] {
  const params: DistrictParamRecord[] = [];

  for (const c of INITIAL_COMMUNES) {
    params.push({
      param_id: `param-com-${c.code.toLowerCase()}`,
      categorie: 'COMMUNE',
      valeur: c.code,
      libelle: c.label,
      metadata_json: JSON.stringify({ district: 'Sidi Ali' }),
      actif: true,
    });
  }

  for (const dp of INITIAL_DPS) {
    params.push({
      param_id: `param-dp-${dp.code.toLowerCase()}`,
      categorie: 'DP',
      valeur: dp.code,
      libelle: dp.label,
      metadata_json: JSON.stringify({ commune_defaut: dp.communeRef }),
      actif: true,
    });
  }

  for (const cat of INITIAL_TASK_CATEGORIES) {
    params.push({
      param_id: `param-cat-${cat.code.toLowerCase()}`,
      categorie: 'CATEGORIE_TRAVAUX',
      valeur: cat.code,
      libelle: cat.label,
      metadata_json: '{}',
      actif: true,
    });
  }

  return params;
}

export function buildInitialChiefAgent(): AgentRecord {
  return {
    agent_id: uuidv4(),
    matricule: 'CHEF-SA-001',
    nom: 'CHEF ÉQUIPE',
    prenom: 'District Sidi Ali',
    telephone: '045000000',
    fonction: "Chef d'équipe gaz distribution",
    photo_url: '',
    login_email: DEFAULT_CHIEF_EMAIL,
    firebase_uid: '',
    password_hash: '',
    role: 'CHEF',
    statut: 'ACTIF',
    must_change_password: false,
    token_version: 1,
    date_creation: nowIso(),
    derniere_connexion: '',
  };
}
