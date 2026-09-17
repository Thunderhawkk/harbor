import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useMangaFavorites } from "@/lib/manga-favorites";
import { mangaLists } from "@/lib/manga-lists";
import { MangaFavCard } from "../library/manga-fav-card";
import { Grid } from "../library/shared";
import { MyListsTab } from "../library/my-lists-tab";

export function MangaLibrary() {
  const t = useT();
  const { items } = useMangaFavorites();
  const favs = useMemo(() => [...items.values()].sort((a, b) => b.addedAt - a.addedAt), [items]);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[22px] font-medium tracking-tight text-ink">{t("Favorites")}</h2>
          {favs.length > 0 && (
            <span className="text-[15px] text-ink-subtle">{favs.length}</span>
          )}
        </div>
        {favs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-edge-soft bg-surface/40 px-6 py-10 text-center text-[14px] text-ink-muted">
            {t("Tap the star on any manga to save it here.")}
          </p>
        ) : (
          <Grid>
            {favs.map((e) => (
              <MangaFavCard key={e.id} entry={e} />
            ))}
          </Grid>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">{t("Lists")}</h2>
        <MyListsTab
          store={mangaLists}
          showSearch={false}
          emptyCopy={{
            title: t("Create your first manga list"),
            body: t("Group the manga you love. Reading now, backlog, all-time favorites."),
            action: t("New list"),
          }}
        />
      </section>
    </div>
  );
}
