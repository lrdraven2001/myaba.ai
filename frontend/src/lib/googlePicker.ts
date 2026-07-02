/**
 * Google Drive Picker integration (OAuth scope: drive.file).
 *
 * Uses Google Identity Services (GIS) for a per-user OAuth access token and the
 * Google Picker API for the hosted folder/file browser. With the `drive.file`
 * scope the app only ever sees items the user explicitly picks — least-privilege,
 * and crucially NOT a "restricted" scope, so it needs no Google app verification.
 *
 * Configuration (gitignored env — never commit real values):
 *   VITE_GOOGLE_DRIVE_CLIENT_ID  — OAuth 2.0 Web client ID
 *   VITE_GOOGLE_DRIVE_API_KEY    — browser API key (restricted to the app origins)
 *
 * When unconfigured, {@link isPickerConfigured} returns false and callers should
 * fall back to manual link entry.
 */

// import.meta.env is typed with only the known VITE_* keys; cast for our custom ones.
const ENV = import.meta.env as unknown as Record<string, string | undefined>;
const CLIENT_ID = ENV.VITE_GOOGLE_DRIVE_CLIENT_ID;
const API_KEY = ENV.VITE_GOOGLE_DRIVE_API_KEY;

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface PickedDriveItem {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  isFolder: boolean;
}

/** True when both the OAuth client ID and the browser API key are configured. */
export function isPickerConfigured(): boolean {
  return Boolean(CLIENT_ID && API_KEY);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function getAccessToken(): Promise<string> {
  return loadScript(GIS_SRC).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const g = (window as any).google;
        const tokenClient = g.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: DRIVE_FILE_SCOPE,
          callback: (resp: any) => {
            if (resp.error) reject(new Error(resp.error));
            else resolve(resp.access_token);
          },
        });
        // Empty prompt re-uses an existing grant silently when possible.
        tokenClient.requestAccessToken({ prompt: '' });
      }),
  );
}

function showPicker(token: string, mode: 'file' | 'folder'): Promise<PickedDriveItem | null> {
  return loadScript(GAPI_SRC)
    .then(() => new Promise<void>((resolve) => (window as any).gapi.load('picker', resolve)))
    .then(
      () =>
        new Promise<PickedDriveItem | null>((resolve) => {
          const g = (window as any).google;
          const view = new g.picker.DocsView(
            mode === 'folder' ? g.picker.ViewId.FOLDERS : g.picker.ViewId.DOCS,
          )
            .setIncludeFolders(true)
            .setSelectFolderEnabled(mode === 'folder');

          const picker = new g.picker.PickerBuilder()
            .setOAuthToken(token)
            .setDeveloperKey(API_KEY)
            .addView(view)
            .setTitle(`Select a ${mode} from Google Drive`)
            .setCallback((data: any) => {
              if (data.action === g.picker.Action.PICKED) {
                const doc = data.docs?.[0];
                resolve(
                  doc
                    ? {
                        id: doc.id,
                        name: doc.name,
                        url: doc.url,
                        mimeType: doc.mimeType,
                        isFolder: doc.mimeType === FOLDER_MIME,
                      }
                    : null,
                );
              } else if (data.action === g.picker.Action.CANCEL) {
                resolve(null);
              }
            })
            .build();
          picker.setVisible(true);
        }),
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Open the Google Drive Picker and resolve the chosen item (or null if the user
 * cancels). `mode` controls whether the picker is oriented to folders or files.
 * @throws if the picker is not configured or the user denies OAuth.
 */
export async function openDrivePicker(mode: 'file' | 'folder' = 'folder'): Promise<PickedDriveItem | null> {
  if (!isPickerConfigured()) throw new Error('Google Drive Picker is not configured');
  const token = await getAccessToken();
  return showPicker(token, mode);
}

/** Result of picking + downloading a Drive file for import. */
export interface DriveImport {
  name: string;
  /** Plain text — set for Google-native Docs/Sheets (exported directly). */
  text?: string;
  /** Binary upload — set for regular files (docx/pdf/xlsx/…); extract server-side. */
  file?: File;
}

const GOOGLE_DOC   = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';

/**
 * Pick a file from Google Drive and download its content for import (null if
 * the user cancels). Google-native Docs/Sheets are exported as text/CSV;
 * regular files come back as a File for server-side text extraction.
 * @throws for unsupported Google-native types (Slides, Forms, …) or download errors.
 */
export async function importDriveFile(): Promise<DriveImport | null> {
  if (!isPickerConfigured()) throw new Error('Google Drive Picker is not configured');
  const token = await getAccessToken();
  const item = await showPicker(token, 'file');
  if (!item) return null;

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  if (item.mimeType.startsWith('application/vnd.google-apps')) {
    const exportMime = item.mimeType === GOOGLE_DOC ? 'text/plain'
                     : item.mimeType === GOOGLE_SHEET ? 'text/csv'
                     : null;
    if (!exportMime) {
      throw new Error(`"${item.name}" is a Google ${item.mimeType.split('.').pop()} — only Docs, Sheets, and regular files can be imported.`);
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${item.id}/export?mimeType=${encodeURIComponent(exportMime)}`, auth);
    if (!res.ok) throw new Error(`Could not read "${item.name}" from Drive (HTTP ${res.status}).`);
    return { name: item.name, text: await res.text() };
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, auth);
  if (!res.ok) throw new Error(`Could not download "${item.name}" from Drive (HTTP ${res.status}).`);
  const blob = await res.blob();
  return { name: item.name, file: new File([blob], item.name, { type: blob.type }) };
}
