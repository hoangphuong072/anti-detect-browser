import { z } from "zod";
import { proxySchema } from "./proxy.js";

export const createBrowserSchema = z.object({
  name: z.string().min(1).max(80),
  proxy: proxySchema.optional(),
  persistentProfile: z.boolean(),
  startupUrl: z.string().url().optional().or(z.literal(""))
});

export const updateProxySchema = z.object({
  proxy: proxySchema.optional().nullable()
});
