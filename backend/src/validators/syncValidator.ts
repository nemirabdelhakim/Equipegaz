import { z } from 'zod';

export const SyncOperationItemSchema = z.object({
  operation_id: z
    .string()
    .uuid("Chaque opération de synchronisation doit posséder un UUID valide."),
  type_operation: z.enum([
    'TASK_AGENT_STATUS',
    'TASK_UPDATE',
    'PHOTO_UPLOAD',
    'REPORT_SUBMIT',
  ]),
  target_id: z.string().trim().min(1, 'Identifiant cible manquant.'),
  client_timestamp: z.string().trim().min(1),
  base_version: z.number().int().positive().optional(),
  local_photo_id: z.string().trim().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const SyncPushBatchSchema = z.object({
  device_id: z.string().trim().min(2).max(128).default('web-device'),
  operations: z
    .array(SyncOperationItemSchema)
    .max(50, 'Maximum 50 opérations par lot de synchronisation.'),
});
