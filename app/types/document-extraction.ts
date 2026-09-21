import type { Source } from "./government-source";

export interface ExtractedFields {
  documentType?: string;
  applicantName?: string;
  applicationId?: string;
  dates: string[];
  amounts: string[];
  requiredDocuments: string[];
  deadlines: string[];
  officeOrDepartment?: string;
  [key: string]: unknown;
}

export interface DocumentAnalysis {
  documentType: string;
  language: string;
  summary: string;
  summaryTelugu?: string;
  extractedFields: ExtractedFields;
  sources: Source[];
  verified: boolean;
}
