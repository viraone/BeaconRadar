export type EnrichInput = {
  company: string;
  companyDomain: string | null;
  person: string | null;
  title: string | null;
};

export type EmailStatus = "verified" | "unverified" | "not_found";

export type EnrichResult = {
  status: EmailStatus;
  email: string | null;
  /** 0..1 when the provider gives one. */
  confidence: number | null;
  /** Where the provider says it found it, when it gives a URL. */
  sourceUrl: string | null;
};

export interface EmailProvider {
  readonly name: string;
  /** True if this provider's results are fabricated test data. */
  readonly isMock: boolean;
  findEmail(input: EnrichInput): Promise<EnrichResult>;
}

export const NOT_FOUND: EnrichResult = { status: "not_found", email: null, confidence: null, sourceUrl: null };
