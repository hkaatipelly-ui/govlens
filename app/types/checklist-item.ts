export interface ChecklistItem {
  id: string;
  label: string;
  detail?: string;
  sourceId?: string;
  done: boolean;
}
