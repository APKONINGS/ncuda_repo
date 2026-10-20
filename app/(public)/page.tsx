import { ActivitiesPreview } from "@/components/sections/home/ActivitiesPreview";
import { Community } from "@/components/sections/home/Community";
import { Development } from "@/components/sections/home/Development";
import { Future } from "@/components/sections/home/Future";
import { Gallery } from "@/components/sections/home/Gallery";
import { Heritage } from "@/components/sections/home/Heritage";
import { Hero } from "@/components/sections/home/Hero";
import { Intro } from "@/components/sections/home/Intro";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Intro />
      <Heritage />
      <Community />
      <ActivitiesPreview />
      <Development />
      <Gallery />
      <Future />
    </>
  );
}
