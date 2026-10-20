/**
 * Public-site content for NCUDA.
 *
 * RULES FOR THIS FILE
 * - `facts` contains ONLY information verified from published sources
 *   (listed in docs/RESEARCH.md). Keep it that way.
 * - Anything NCUDA has not yet supplied is a `Placeholder` and is rendered with
 *   a visible "to be confirmed" marker. Do not convert a placeholder into
 *   plain copy until NCUDA leadership has approved the wording.
 * - Never add statistics, dates, names or achievements without a source.
 */

export type Placeholder = { placeholder: true; text: string; note?: string };
export const ph = (text: string, note?: string): Placeholder => ({
  placeholder: true,
  text,
  note,
});
export type Copy = string | Placeholder;

export const site = {
  shortName: "NCUDA",
  name: "Ngwo Cultural and Development Association",
  title: "NCUDA — Ngwo Cultural and Development Association",
  description:
    "NCUDA, the Ngwo Cultural and Development Association, brings Ngwo people together around their shared heritage and the development of their community in Njikwa Subdivision, Momo Division, Northwest Cameroon.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

/** Verified facts — see docs/RESEARCH.md for sources. */
export const facts = {
  location: [
    { label: "Subdivision", value: "Njikwa" },
    { label: "Division", value: "Momo" },
    { label: "Region", value: "Northwest, Cameroon" },
    { label: "Distance", value: "About 70 km south-west of Bamenda" },
    { label: "Language", value: "Engwo (Ngwo)" },
  ],
  clan: "Ngwo is the paramount fondom of the Ngwaw clan, which takes in the villages of Njikwa Subdivision.",
  njikwaMeaning: "Njikwa is reported to mean “road to the farm” in Engwo.",
  dispersal:
    "Many Ngwo people today live away from the village — in Bamenda, Yaoundé, Douala, towns of the Southwest Region and abroad.",
  branches:
    "The association has branches in Cameroon and in the diaspora, including a registered chapter in the United States.",
};

export const nav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/activities", label: "Activities" },
  { href: "/contact", label: "Contact" },
] as const;

export const contact = {
  phone: ph("+237 · phone number to be provided"),
  email: ph("email address to be provided"),
  address: ph(
    "Office address to be provided",
    "NCUDA to confirm its official correspondence address.",
  ),
  homeland:
    "Ngwo, Njikwa Subdivision, Momo Division, Northwest Region, Cameroon",
  social: [] as Array<{ label: string; href: string }>, // Add official accounts when supplied.
};

export const about = {
  whoWeAre:
    "NCUDA — the Ngwo Cultural and Development Association — is the association through which Ngwo people come together: to keep their culture alive, to support one another, and to work for the development of home.",
  story: ph(
    "Our founding story — when and where it began, who started it and why — will be told here in the association’s own words.",
    "Founding date and history must come from the association’s records.",
  ),
  mission: ph(
    "To preserve and promote the culture of Ngwo, to unite Ngwo people at home and abroad, and to support the development of the Ngwo community.",
    "Draft wording only — the official mission statement is still to be supplied.",
  ),
  vision: ph(
    "A united Ngwo community that carries its heritage proudly into a prosperous future.",
    "Draft wording only — the official vision statement is still to be supplied.",
  ),
  objectives: [
    ph("Preserve and promote Ngwo language, customs and cultural expression."),
    ph("Bring Ngwo people together through chapters at home and abroad."),
    ph("Support members and families in times of need."),
    ph("Identify and support development priorities for Ngwo."),
  ],
  leadership: [
    { role: "President General", name: ph("Name to be confirmed") },
    { role: "Central Executive (EXCO)", name: ph("Members to be confirmed") },
    { role: "Regional Coordinators", name: ph("Where applicable") },
    { role: "Chapter Presidents", name: ph("Per chapter") },
  ],
};

export type ActivityCategory = {
  slug: string;
  title: string;
  summary: string;
  image?: keyof typeof import("./images").images;
  /** Published NCUDA activities in this category. Empty until NCUDA supplies records. */
  entries: Array<{
    title: string;
    date: string;
    chapter?: string;
    summary: string;
  }>;
};

/**
 * Categories describe the KINDS of work an association like NCUDA does.
 * They are not claims that a specific activity is currently happening.
 */
export const activityCategories: ActivityCategory[] = [
  {
    slug: "cultural",
    title: "Cultural Activities",
    summary:
      "Gatherings, dance, music, dress and language — the living expressions of Ngwo identity, shared across generations.",
    image: "mbengwiMonument",
    entries: [],
  },
  {
    slug: "meetings",
    title: "Community Meetings",
    summary:
      "Regular chapter and general meetings where members deliberate, decide and hold one another to account.",
    image: "guzangMarket",
    entries: [],
  },
  {
    slug: "development",
    title: "Community Development",
    summary:
      "Collective effort on the things a community needs to thrive — from infrastructure to education to livelihoods.",
    image: "classroomBuild",
    entries: [],
  },
  {
    slug: "welfare",
    title: "Social Welfare",
    summary:
      "Standing with members and families through illness, bereavement and hardship.",
    entries: [],
  },
  {
    slug: "youth-family",
    title: "Youth & Family",
    summary:
      "Passing heritage to the next generation and creating space for young people to lead.",
    image: "communityWorks",
    entries: [],
  },
  {
    slug: "initiatives",
    title: "Development Initiatives",
    summary:
      "Specific projects identified, funded and delivered by members working together.",
    image: "highlandFarmland",
    entries: [],
  },
];
