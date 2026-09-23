import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

export function MusicBackButton({
  onClick,
  label,
  mast = false,
}: {
  onClick: () => void;
  label?: string;
  mast?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-music-mast-back={mast || undefined}
      onClick={onClick}
      className="music-page-back"
    >
      <ArrowLeft size={20} className="dir-icon" aria-hidden />
      <span>{label ?? t("Back")}</span>
    </button>
  );
}
