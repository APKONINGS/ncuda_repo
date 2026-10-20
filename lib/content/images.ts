import type { StaticImageData } from "next/image";

import momoHills from "@/public/images/hero/momo-hills-batibo.jpg";
import batiboValley from "@/public/images/about/batibo-valley.jpg";
import batiboWaterfall from "@/public/images/about/batibo-waterfall.jpg";
import mbengwiMonument from "@/public/images/culture/mbengwi-monument.jpg";
import northwestRegalia from "@/public/images/culture/northwest-regalia.jpg";
import northwestElders from "@/public/images/culture/northwest-elders-atoghu.jpg";
import kobDance from "@/public/images/activities/kob-mbengwi-dance.jpg";
import classroomBuild from "@/public/images/activities/mbengwi-classroom-construction.jpg";
import communityWorks from "@/public/images/activities/mbengwi-community-works.jpg";
import guzangMarket from "@/public/images/community/guzang-market.jpg";
import highlandFarmland from "@/public/images/community/northwest-highland-farmland.jpg";

/**
 * Every photograph used on the public site, with honest captions.
 *
 * `relation` records what the photo actually shows relative to Ngwo, so the
 * UI never implies an image is "Ngwo" when it is not:
 *   - "momo-division": taken in Momo Division, the division Ngwo belongs to
 *   - "northwest-region": Northwest Region context, not specific to Ngwo
 *
 * No photograph in this set has been verified as taken in Ngwo itself.
 * Replace with NCUDA's own photographs as they become available.
 * Full licensing details: public/images/SOURCES.md
 */
export type SiteImage = {
  src: StaticImageData;
  alt: string;
  caption: string;
  relation: "momo-division" | "northwest-region";
  credit: string;
  license: "CC BY-SA 4.0" | "CC0";
  sourceUrl: string;
};

const BYSA = "CC BY-SA 4.0" as const;

export const images = {
  momoHills: {
    src: momoHills,
    alt: "Green hills and a hillside town under a hazy sky in Batibo, Momo Division",
    caption: "Hills of Momo Division, seen from Batibo",
    relation: "momo-division",
    credit: "Bdx",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:View_on_Batibo_(2).JPG",
  },
  batiboValley: {
    src: batiboValley,
    alt: "A valley of palms and scattered roofs below distant mountains in Batibo",
    caption: "Valley near Batibo, Momo Division",
    relation: "momo-division",
    credit: "Bdx",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:View_on_Batibo_(1).JPG",
  },
  batiboWaterfall: {
    src: batiboWaterfall,
    alt: "A waterfall falling over a dark rock face surrounded by dense green forest",
    caption: "Waterfall in Batibo, Momo Division",
    relation: "momo-division",
    credit: "Bdx",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Batibo,_Waterfall_(1).JPG",
  },
  mbengwiMonument: {
    src: mbengwiMonument,
    alt: "Black-and-white photograph of a monument of three figures drumming and dancing",
    caption: "Monument in Mbengwi, headquarters of Momo Division",
    relation: "momo-division",
    credit: "WestDragon 45",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Cultural_display_of_momo.jpg",
  },
  northwestRegalia: {
    src: northwestRegalia,
    alt: "A man and a woman wearing richly embroidered black, red and gold traditional gowns",
    caption: "Embroidered regalia of Cameroon's Northwest Region",
    relation: "northwest-region",
    credit: "Dohsen Margaret",
    license: "CC0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:People_in_Bamenda_Traditional_regalia.jpg",
  },
  northwestElders: {
    src: northwestElders,
    alt: "Two elders in black velvet gowns embroidered with orange and gold, wearing traditional caps",
    caption: "Elders in atoghu at a cultural event, Northwest Region",
    relation: "northwest-region",
    credit: "Osambisusaline",
    license: "CC0",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Traditional_outfit_of_the_Northwest_Region_Of_Cameroon.jpg",
  },
  kobDance: {
    src: kobDance,
    alt: "Dancers in raffia skirts and ankle rattles performing on open ground while people watch",
    caption: "Traditional dance in Kob, Mbengwi — Momo Division",
    relation: "momo-division",
    credit: "Fomukom Joel",
    license: BYSA,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Traditional_Dance_in_Kob_%E2%80%94_Mbengwi,_North_West_Region_of_Cameroon.jpg",
  },
  classroomBuild: {
    src: classroomBuild,
    alt: "Workers in hard hats laying foundations for classrooms on red earth, with forested hills behind",
    caption: "Classroom construction in Mbengwi, Momo Division",
    relation: "momo-division",
    credit: "EzekielFokam",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Construction_of_classrooms_by_Mbengwi_council.jpg",
  },
  communityWorks: {
    src: communityWorks,
    alt: "Young workers in high-visibility vests digging foundations on a hillside site",
    caption: "Youth employed on public works in Mbengwi, Momo Division",
    relation: "momo-division",
    credit: "EzekielFokam",
    license: BYSA,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Mbengwi_council_fighting_unemployment_by_employing_youths_to_work.jpg",
  },
  guzangMarket: {
    src: guzangMarket,
    alt: "Rows of wooden market tables on red earth under a hazy sky, with hills in the distance",
    caption: "Market grounds in Guzang, Momo Division",
    relation: "momo-division",
    credit: "Bdx",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Market_in_Guzang_(2).JPG",
  },
  highlandFarmland: {
    src: highlandFarmland,
    alt: "A tall field of maize in the foreground with a town and blue hills under white clouds",
    caption: "Highland farmland, Northwest Region",
    relation: "northwest-region",
    credit: "Alvy Bih",
    license: BYSA,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Highlands_of_Bamenda_02.jpg",
  },
} satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof images;
