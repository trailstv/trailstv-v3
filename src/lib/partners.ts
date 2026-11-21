/**
 * "Work with TrailsTV" (/partners): the four partner types, the form's options, and validation.
 * Safe to import from client components (no server code here). Server helpers: partners-server.ts.
 */
import { z } from "zod";

export type PartnerKind = "brand" | "outfitter" | "nonprofit" | "creator";

export const PARTNER_TYPES: { kind: PartnerKind; icon: string; title: string; who: string; offers: string[] }[] = [
  {
    kind: "brand",
    icon: "🎒",
    title: "Brands & sponsors",
    who: "Outdoor gear, apparel, travel and vehicle brands.",
    offers: [
      "Sponsor a park, an activity or a Top 3 list",
      "“Presented by” placement on park and activity videos",
      "Gear features on the activity pages people plan with",
      "Seasonal campaigns: snow season, summer road trips, dark-sky nights",
    ],
  },
  {
    kind: "outfitter",
    icon: "🛶",
    title: "Outfitters & guides",
    who: "Guide services, rentals, lodges and tour operators in and around the parks.",
    offers: [
      "Get found on the parks and activities you run trips in",
      "Featured placement next to the trails and campgrounds you serve",
      "Trip ideas and itineraries built with your team",
      "Video of your trips, made with TrailsTV creators",
    ],
  },
  {
    kind: "nonprofit",
    icon: "🌲",
    title: "Nonprofits & tourism",
    who: "Park conservancies, friends groups, visitor bureaus and tourism boards.",
    offers: [
      "Share stewardship, safety and Leave No Trace messages where visitors plan",
      "Feature volunteer days, events and fundraising campaigns",
      "Co-produced destination videos and seasonal guides",
      "Data and content partnerships for your region",
    ],
  },
  {
    kind: "creator",
    icon: "🎥",
    title: "Filmmakers & creators",
    who: "Videographers, photographers and storytellers who work in the parks.",
    offers: [
      "Contribute park and activity videos, credited to you",
      "Commissions and licensing for TrailsTV+ originals: let’s talk terms",
      "Photo credits on park headers and pages",
      "Collaborations with brands and parks in the TrailsTV family",
    ],
  },
];

export const KIND_LABEL: Record<PartnerKind | "other", string> = {
  brand: "Brand or sponsor",
  outfitter: "Outfitter or guide",
  nonprofit: "Nonprofit or tourism",
  creator: "Filmmaker or creator",
  other: "Something else",
};

export const INTERESTS = ["Sponsorship", "Videos & photos", "Listings & placement", "Co-marketing & events", "Data or content partnership", "Something else"] as const;

export const BUDGETS = ["Not sure yet", "Under $1,000", "$1,000–5,000", "$5,000–25,000", "$25,000+", "Not applicable"] as const;

export const InquiryInput = z.object({
  name: z.string().trim().min(2, "Please add your name").max(120),
  email: z.string().trim().toLowerCase().email("Please add a valid email").max(200),
  organization: z.string().trim().min(2, "Please add your organization").max(160),
  website: z.string().trim().max(300).optional().transform((v) => {
    if (!v) return undefined;
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try { return new URL(url).toString(); } catch { return undefined; }
  }),
  kind: z.enum(["brand", "outfitter", "nonprofit", "creator", "other"], { message: "Please choose what describes you" }),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).default([]),
  parks: z.string().trim().max(400).optional(),
  budget: z.enum(BUDGETS).optional(),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters)").max(4000),
});
export type InquiryInput = z.infer<typeof InquiryInput>;
