import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const MAX_BYTES = 10 * 1024 * 1024;
const PREFIX = 'tally-';

/** Write `content` to a temp file and open the share sheet (browser: trigger a download). */
export async function shareTextFile(filename: string, content: string, mimeType: string) {
  const name = `${PREFIX}${filename}`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Save or share' });
}

/** Exports contain your full financial history, so stale ones are removed from the cache on launch. */
export function cleanupExports() {
  if (Platform.OS === 'web') return;
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(PREFIX)) entry.delete();
    }
  } catch {
    // best effort: the OS also clears the cache under storage pressure
  }
}

export interface PickedText {
  name: string;
  text: string;
}

/** Let the user choose a text file. Returns null if cancelled. Throws on oversize files. */
export async function pickTextFile(types: string[]): Promise<PickedText | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || res.assets.length === 0) return null;
  const asset = res.assets[0];
  if ((asset.size ?? 0) > MAX_BYTES) throw new Error('That file is larger than 10 MB.');
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('Could not read that file.');
    return { name: asset.name, text: await asset.file.text() };
  }
  const file = new File(asset.uri);
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 10 MB.');
  const text = await file.text();
  try {
    file.delete(); // the picker copied it into our cache; don't leave a plaintext copy behind
  } catch {
    // ignore
  }
  return { name: asset.name, text };
}
