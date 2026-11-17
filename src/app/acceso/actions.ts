"use server";

import { systemDb } from "@/db/client";
import { submitAccessRequest, type SubmitError } from "@/lib/access-requests";

export interface RequestAccessState {
  error: SubmitError | null;
  /** Set once the request is recorded. */
  sentTo: string | null;
  email: string;
  businessName: string;
  website: string;
}

const field = (formData: FormData, name: string, max: number) =>
  String(formData.get(name) ?? "").trim().slice(0, max);

/** The public form. No session: anyone may ask. */
export async function requestAccess(
  _previous: RequestAccessState,
  formData: FormData,
): Promise<RequestAccessState> {
  const email = field(formData, "email", 254).toLowerCase();
  const businessName = field(formData, "business", 120);
  const website = field(formData, "website", 2_000);
  const typed = { email, businessName, website };
  const interest = {
    planInterest: field(formData, "plan_interest", 20),
    billingInterest: field(formData, "billing_interest", 20),
  };

  // A field people never see. Scripts that fill every input get the same
  // answer as a real request, and nothing is saved.
  if (field(formData, "company_fax", 200)) return { error: null, sentTo: email, ...typed };

  const result = await submitAccessRequest(systemDb(), { ...typed, ...interest });
  if (!result.ok) return { error: result.error, sentTo: null, ...typed };
  return { error: null, sentTo: result.email, ...typed };
}
