export interface Source {
  id: string;
  title: string;
  department?: string;
}

export interface SourceMetadata {
  id: string;
  title: string;
  department: string;
  state: string;
  type: string;
  sourceUrl: string;
  language: string;
  publishedDate: string;
  effectiveDate: string;
  lastVerified: string;
}

export interface GovernmentDocument {
  id: string;
  title: string;
  department: string;
  state: string;
  type: string;
  sourceUrl: string;
  language: string;
  publishedDate: string;
  effectiveDate: string;
  lastVerified: string;
  text: string;
}
