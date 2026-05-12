import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@bruinchat_local_reports";

export type LocalReport = {
  id: string;
  reportedName: string;
  reportedEmail: string;
  note?: string;
  submittedAt: string;
};

export async function getLocalReports(): Promise<LocalReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addLocalReport(input: {
  reportedName: string;
  reportedEmail: string;
  note?: string;
}): Promise<LocalReport> {
  const list = await getLocalReports();
  const entry: LocalReport = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    reportedName: input.reportedName.trim(),
    reportedEmail: input.reportedEmail.trim(),
    note: input.note?.trim() || undefined,
    submittedAt: new Date().toISOString(),
  };
  list.unshift(entry);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return entry;
}
