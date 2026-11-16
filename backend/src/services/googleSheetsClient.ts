import {
  DRIVE_ROOT_FOLDER_NAME,
  SHEETS_SCHEMA,
  WORKBOOK_TITLE,
} from '../../../database/google-sheets/sheetDefinitions.js';

export interface SpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetTitles: string[];
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function googleFetch<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const errObj = json as { error?: { message?: string } };
    const msg = errObj?.error?.message || `Erreur Google API (${res.status})`;
    throw new GoogleApiError(res.status, msg);
  }

  return json as T;
}

export class GoogleSheetsClient {
  async verifyToken(accessToken: string): Promise<{ email?: string; scope?: string }> {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) {
      throw new GoogleApiError(401, 'Jeton Google Workspace invalide ou expiré.');
    }
    return (await res.json()) as { email?: string; scope?: string };
  }

  async findFileByName(
    accessToken: string,
    name: string,
    mimeType: string
  ): Promise<{ id: string; name: string; webViewLink?: string } | null> {
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = '${mimeType}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=5`;
    const data = await googleFetch<{
      files?: Array<{ id: string; name: string; webViewLink?: string }>;
    }>(url, accessToken);
    return data.files?.[0] || null;
  }

  async ensureDriveFolder(accessToken: string, folderName = DRIVE_ROOT_FOLDER_NAME): Promise<{
    id: string;
    name: string;
    webViewLink?: string;
  }> {
    const existing = await this.findFileByName(
      accessToken,
      folderName,
      'application/vnd.google-apps.folder'
    );
    if (existing) return existing;

    return googleFetch<{ id: string; name: string; webViewLink?: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      }
    );
  }

  async uploadJsonFileToFolder(
    accessToken: string,
    folderId: string,
    fileName: string,
    content: string
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const boundary = `sonelgaz_boundary_${Date.now()}`;
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    return googleFetch<{ id: string; name: string; webViewLink?: string }>(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
  }

  async ensureDriveSubfolder(
    accessToken: string,
    parentFolderId: string,
    folderName: string
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const safeName = folderName.replace(/'/g, "\\'");
    const q = `name = '${safeName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=5`;
    const found = await googleFetch<{
      files?: Array<{ id: string; name: string; webViewLink?: string }>;
    }>(url, accessToken);
    if (found.files?.[0]) return found.files[0];

    return googleFetch<{ id: string; name: string; webViewLink?: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          parents: [parentFolderId],
          mimeType: 'application/vnd.google-apps.folder',
        }),
      }
    );
  }

  async uploadBinaryFileToFolder(
    accessToken: string,
    folderId: string,
    fileName: string,
    mimeType: string,
    data: Buffer
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const boundary = `sonelgaz_bin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType,
    });

    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      'utf-8'
    );
    const tail = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
    const body = Buffer.concat([head, data, tail]);

    return googleFetch<{ id: string; name: string; webViewLink?: string }>(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      accessToken,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
  }

  async getSpreadsheetMeta(
    accessToken: string,
    spreadsheetId: string
  ): Promise<SpreadsheetInfo & { sheetsByName: Record<string, number> }> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title))`;
    const data = await googleFetch<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      sheets?: Array<{ properties: { sheetId: number; title: string } }>;
    }>(url, accessToken);

    const sheetsByName: Record<string, number> = {};
    const sheetTitles: string[] = [];
    for (const s of data.sheets || []) {
      sheetsByName[s.properties.title] = s.properties.sheetId;
      sheetTitles.push(s.properties.title);
    }

    return {
      spreadsheetId: data.spreadsheetId,
      spreadsheetUrl: data.spreadsheetUrl,
      sheetTitles,
      sheetsByName,
    };
  }

  async ensureWorkbook(
    accessToken: string,
    existingSpreadsheetId?: string
  ): Promise<SpreadsheetInfo> {
    let targetId = existingSpreadsheetId;

    if (!targetId) {
      const existingFile = await this.findFileByName(
        accessToken,
        WORKBOOK_TITLE,
        'application/vnd.google-apps.spreadsheet'
      );
      if (existingFile) {
        targetId = existingFile.id;
      }
    }

    if (!targetId) {
      // Créer le classeur avec les 11 feuilles directement
      const created = await googleFetch<{
        spreadsheetId: string;
        spreadsheetUrl: string;
        sheets: Array<{ properties: { sheetId: number; title: string } }>;
      }>('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            title: WORKBOOK_TITLE,
            locale: 'fr_FR',
            timeZone: 'Africa/Algiers',
          },
          sheets: SHEETS_SCHEMA.map((def, index) => ({
            properties: {
              title: def.name,
              index,
              gridProperties: {
                frozenRowCount: 1,
                rowCount: 1000,
                columnCount: Math.max(def.headers.length, 10),
              },
            },
          })),
        }),
      });

      await this.applyHeaderFormattingAndValues(
        accessToken,
        created.spreadsheetId,
        Object.fromEntries(
          created.sheets.map((s) => [s.properties.title, s.properties.sheetId])
        )
      );

      return {
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl,
        sheetTitles: SHEETS_SCHEMA.map((s) => s.name),
      };
    }

    // Vérifier et ajouter les onglets manquants si le classeur existait déjà
    let meta = await this.getSpreadsheetMeta(accessToken, targetId);
    const missing = SHEETS_SCHEMA.filter((s) => !(s.name in meta.sheetsByName));

    if (missing.length > 0) {
      await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(targetId)}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: missing.map((def) => ({
              addSheet: {
                properties: {
                  title: def.name,
                  gridProperties: {
                    frozenRowCount: 1,
                    rowCount: 1000,
                    columnCount: Math.max(def.headers.length, 10),
                  },
                },
              },
            })),
          }),
        }
      );
      meta = await this.getSpreadsheetMeta(accessToken, targetId);
    }

    await this.applyHeaderFormattingAndValues(accessToken, targetId, meta.sheetsByName);

    return {
      spreadsheetId: meta.spreadsheetId,
      spreadsheetUrl: meta.spreadsheetUrl,
      sheetTitles: meta.sheetTitles,
    };
  }

  private async applyHeaderFormattingAndValues(
    accessToken: string,
    spreadsheetId: string,
    sheetsByName: Record<string, number>
  ): Promise<void> {
    // 1. Écrire les en-têtes exacts sur la ligne 1 de chaque feuille
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: SHEETS_SCHEMA.map((def) => ({
            range: `${def.name}!A1`,
            values: [def.headers],
          })),
        }),
      }
    );

    // 2. Mettre en forme la ligne d'en-tête (Bleu Sonelgaz #0055A4 + texte blanc gras)
    const formatRequests = SHEETS_SCHEMA.filter((def) => def.name in sheetsByName).map(
      (def) => ({
        repeatCell: {
          range: {
            sheetId: sheetsByName[def.name],
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: def.headers.length,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0, green: 0.333, blue: 0.643 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      })
    );

    if (formatRequests.length > 0) {
      await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ requests: formatRequests }),
        }
      );
    }
  }

  async replaceSheetData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    headers: string[],
    rows: Array<Array<string | number | boolean>>
  ): Promise<void> {
    // Effacer puis réécrire proprement en-têtes + données (sécurisé par verrou côté GoogleSyncService)
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1:Z5000`)}:clear`,
      accessToken,
      { method: 'POST', body: JSON.stringify({}) }
    );

    const values = [headers, ...rows];
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1`)}?valueInputOption=RAW`,
      accessToken,
      {
        method: 'PUT',
        body: JSON.stringify({
          range: `${sheetName}!A1`,
          majorDimension: 'ROWS',
          values,
        }),
      }
    );
  }

  async readSheetValues(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1:Z1000`)}`;
    const data = await googleFetch<{ values?: string[][] }>(url, accessToken);
    return data.values || [];
  }
}
