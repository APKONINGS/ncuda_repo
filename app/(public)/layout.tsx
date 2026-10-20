import { SiteFooter } from "@/components/footer/SiteFooter";
import { SiteHeader } from "@/components/navigation/SiteHeader";
import { RevealRoot } from "@/components/ui/RevealRoot";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <RevealRoot />
    </>
  );
}
