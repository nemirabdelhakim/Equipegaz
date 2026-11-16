import { z } from 'zod';

export const AgentStatusSchema = z.enum(['ACTIF', 'INACTIF', 'ABSENT', 'CONGÉ', 'SUSPENDU']);
export const UserRoleSchema = z.enum(['CHEF', 'AGENT']);

export const CreateAgentSchema = z.object({
  matricule: z
    .string()
    .trim()
    .min(2, 'Le matricule doit contenir au moins 2 caractères')
    .max(32, 'Le matricule ne peut pas dépasser 32 caractères')
    .regex(/^[A-Za-z0-9\-_]+$/, 'Matricule alphanumérique uniquement (tirets autorisés)'),
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
  prenom: z.string().trim().min(1, 'Le prénom est obligatoire').max(80),
  telephone: z
    .string()
    .trim()
    .min(6, 'Numéro de téléphone invalide')
    .max(30)
    .regex(/^[0-9+\s\-().]+$/, 'Format téléphone invalide'),
  fonction: z.string().trim().min(2, 'La fonction est obligatoire').max(120),
  login_email: z
    .string()
    .trim()
    .min(3, "L'identifiant de connexion est obligatoire")
    .max(160),
  role: UserRoleSchema.default('AGENT'),
  statut: AgentStatusSchema.default('ACTIF'),
  photo_url: z.string().trim().max(500).optional().default(''),
  initial_password: z
    .string()
    .min(8, 'Le mot de passe initial doit contenir au moins 8 caractères')
    .max(128)
    .optional(),
});

export const UpdateAgentSchema = z.object({
  matricule: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9\-_]+$/)
    .optional(),
  nom: z.string().trim().min(1).max(80).optional(),
  prenom: z.string().trim().min(1).max(80).optional(),
  telephone: z
    .string()
    .trim()
    .min(6)
    .max(30)
    .regex(/^[0-9+\s\-().]+$/)
    .optional(),
  fonction: z.string().trim().min(2).max(120).optional(),
  login_email: z.string().trim().min(3).max(160).optional(),
  role: UserRoleSchema.optional(),
  statut: AgentStatusSchema.optional(),
  photo_url: z.string().trim().max(500).optional(),
});

export const UpdateAgentStatusSchema = z.object({
  statut: AgentStatusSchema,
  commentaire: z.string().trim().max(400).optional(),
});

export const LoginCredentialsSchema = z.object({
  identifier: z.string().trim().min(2, 'Identifiant requis').max(160),
  password: z.string().min(1, 'Mot de passe requis').max(128),
  device_id: z.string().trim().max(128).optional().default('web-browser'),
  plateforme: z.enum(['WEB', 'ANDROID']).optional().default('WEB'),
});

export const FirebaseSessionSchema = z.object({
  idToken: z.string().min(20, 'Jeton Firebase invalide'),
  device_id: z.string().trim().max(128).optional().default('web-browser'),
  plateforme: z.enum(['WEB', 'ANDROID']).optional().default('WEB'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z
    .string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
    .max(128),
});
