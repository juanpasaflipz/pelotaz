"use server";

import { refresh } from "next/cache";
import { systemDb } from "@/db/client";
import { decideAccessRequest, isAdmin } from "@/lib/access-requests";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/ids";

/**
 * Approve or reject a request. Checked here and not only on the page: a
 * server action can be called by anyone who is signed in.
 */
export async function decide(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !isAdmin(session.email)) return;
  const id = formData.get("id");
  const decision = formData.get("decision");
  if (!isUuid(id) || (decision !== "approved" && decision !== "rejected")) return;
  await decideAccessRequest(systemDb(), id, decision, session.email);
  refresh();
}
