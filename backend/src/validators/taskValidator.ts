import { z } from 'zod';

export const TaskPrioritySchema = z.enum(['URGENTE', 'HAUTE', 'NORMALE', 'BASSE']);

export const TaskStatusSchema = z.enum([
  'NOUVELLE',
  'TRANSMISE',
  'ACCEPTÉE',
  'EN COURS',
  'EN ATTENTE',
  'BLOQUÉE',
  'TERMINÉE',
  'À VALIDER',
  'VALIDÉE',
  'REFUSÉE',
  'ANNULÉE',
]);

export const ParamCategorySchema = z.enum([
  'COMMUNE',
  'DP',
  'COMMUNE_DP',
  'CATEGORIE_TRAVAUX',
  'EQUIPE',
]);

export const CreateTaskSchema = z.object({
  titre: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères').max(160),
  categorie: z.string().trim().min(1, 'La catégorie est obligatoire').max(40),
  description: z.string().trim().min(3, 'La description est obligatoire').max(3000),
  instructions: z.string().trim().max(2000).optional().default(''),
  commune: z.string().trim().min(1, 'La commune est obligatoire').max(80),
  dp: z.string().trim().min(1, 'La DP est obligatoire').max(80),
  adresse: z.string().trim().min(2, "L'adresse est obligatoire").max(250),
  repere_geo: z.string().trim().max(200).optional().default(''),
  latitude: z.string().trim().max(40).optional().default(''),
  longitude: z.string().trim().max(40).optional().default(''),
  priorite: TaskPrioritySchema.default('NORMALE'),
  date_debut_prevue: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date début invalide (AAAA-MM-JJ)'),
  heure_prevue: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format d'heure invalide (HH:mm)")
    .optional()
    .default('08:30'),
  date_fin_prevue: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date limite invalide (AAAA-MM-JJ)'),
  equipe: z.string().trim().max(80).optional().default(''),
  materiel_necessaire: z.string().trim().max(500).optional().default(''),
  observations: z.string().trim().max(1000).optional().default(''),
  assigned_agent_ids: z.array(z.string().trim().min(1)).optional().default([]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  expected_version: z.number().int().positive().optional(),
});

export const AssignAgentsSchema = z.object({
  agent_ids: z.array(z.string().trim().min(1)).min(1, 'Sélectionnez au moins un agent.'),
  equipe: z.string().trim().max(80).optional().default(''),
  mode: z.enum(['REPLACE', 'ADD']).optional().default('ADD'),
});

export const ChefTaskStatusSchema = z.object({
  statut: TaskStatusSchema,
  commentaire: z.string().trim().max(500).optional().default(''),
});

export const CreateParamSchema = z.object({
  categorie: ParamCategorySchema,
  valeur: z.string().trim().min(1, 'Le code est obligatoire').max(64),
  libelle: z.string().trim().min(1, 'Le libellé est obligatoire').max(160),
  metadata_json: z.string().trim().max(1000).optional().default('{}'),
  actif: z.boolean().optional().default(true),
});

export const UpdateParamSchema = CreateParamSchema.partial();

export const AgentAssignmentStatusSchema = z.enum([
  'TRANSMISE',
  'ACCEPTÉE',
  'EN COURS',
  'EN ATTENTE',
  'BLOQUÉE',
  'TERMINÉE',
]);

export const AgentExecutionStatusSchema = z.object({
  statut_agent: AgentAssignmentStatusSchema,
  motif: z.string().trim().max(500).optional().default(''),
});

export const CreateReportSchema = z.object({
  travail_effectue: z
    .string()
    .trim()
    .min(5, 'Décrivez les travaux effectués (minimum 5 caractères).')
    .max(4000),
  resultat: z
    .string()
    .trim()
    .min(3, 'Indiquez le résultat constaté (minimum 3 caractères).')
    .max(1000),
  difficultes: z.string().trim().max(2000).optional().default(''),
  materiel: z.string().trim().max(1000).optional().default(''),
  travaux_restants: z.string().trim().max(2000).optional().default(''),
  recommandations: z.string().trim().max(2000).optional().default(''),
  temps_passe_minutes: z.coerce.number().int().min(0).max(10000).optional().default(0),
  photo_ids: z.array(z.string().trim().min(1)).optional().default([]),
});

export const UploadPhotoSchema = z.object({
  type_photo: z.enum(['AVANT', 'APRES']),
  file_name: z.string().trim().min(1).max(180),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data_base64: z.string().min(10, 'Image invalide.'),
  report_id: z.string().trim().optional().default(''),
});

export const ReviewReportSchema = z.object({
  decision: z.enum(['VALIDÉ', 'REFUSÉ']),
  commentaire_chef: z.string().trim().max(2000).optional().default(''),
});


